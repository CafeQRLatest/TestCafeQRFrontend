using System;
using System.Collections.Generic;
using System.Data.SQLite;
using System.Globalization;
using System.IO;
using Newtonsoft.Json;

namespace CafeQR.PrintService
{
    internal sealed class DurableStore : IDisposable
    {
        private readonly object sync = new object();
        private readonly SQLiteConnection connection;

        public DurableStore()
        {
            ServicePaths.Ensure();
            var firstRun = !File.Exists(ServicePaths.Database);
            connection = new SQLiteConnection($"Data Source={ServicePaths.Database};Version=3;Journal Mode=WAL;Synchronous=Full;");
            connection.Open();
            if (firstRun) Initialize();
            else Initialize();
            RecoverInterruptedTasks();
        }

        private void Initialize()
        {
            Execute(@"
CREATE TABLE IF NOT EXISTS local_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id TEXT NOT NULL,
    cloud_job_id TEXT,
    lease_token TEXT,
    idempotency_key TEXT NOT NULL,
    job_kind TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    route_id TEXT,
    route_mode TEXT NOT NULL,
    target_index INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    error_message TEXT,
    spool_job_id TEXT,
    created_at_utc TEXT NOT NULL,
    updated_at_utc TEXT NOT NULL,
    next_attempt_at_utc TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_local_job_target
    ON local_jobs(idempotency_key, profile_id, target_index);
CREATE INDEX IF NOT EXISTS idx_local_jobs_ready
    ON local_jobs(status, next_attempt_at_utc, created_at_utc);
CREATE TABLE IF NOT EXISTS local_job_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    local_job_id INTEGER NOT NULL,
    attempt_number INTEGER NOT NULL,
    status TEXT NOT NULL,
    message TEXT,
    spool_job_id TEXT,
    created_at_utc TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_local_job_attempts_job
    ON local_job_attempts(local_job_id, created_at_utc);
");
        }

        public List<LocalPrintTask> Enqueue(
            string groupId,
            CloudPrintJob cloudJob,
            LocalJobSubmission submission,
            IReadOnlyList<RoutedTarget> targets)
        {
            var result = new List<LocalPrintTask>();
            lock (sync)
            using (var transaction = connection.BeginTransaction())
            {
                foreach (var target in targets)
                {
                    var copies = Math.Max(1, target.Copies);
                    for (var copy = 0; copy < copies; copy++)
                    {
                        var index = target.TargetIndex * 100 + copy;
                        using (var command = connection.CreateCommand())
                        {
                            command.Transaction = transaction;
                            command.CommandText = @"
INSERT OR IGNORE INTO local_jobs (
    group_id, cloud_job_id, lease_token, idempotency_key, job_kind,
    profile_id, route_id, route_mode, target_index, attempts, status,
    payload_json, created_at_utc, updated_at_utc
) VALUES (
    @group, @cloud, @lease, @key, @kind,
    @profile, @route, @mode, @target, 0, 'QUEUED',
    @payload, @now, @now
);";
                            command.Parameters.AddWithValue("@group", groupId);
                            command.Parameters.AddWithValue("@cloud", (object)cloudJob?.Id ?? DBNull.Value);
                            command.Parameters.AddWithValue("@lease", (object)cloudJob?.LeaseToken ?? DBNull.Value);
                            command.Parameters.AddWithValue("@key", submission.IdempotencyKey);
                            command.Parameters.AddWithValue("@kind", submission.JobKind ?? "bill");
                            command.Parameters.AddWithValue("@profile", target.Profile.Id);
                            command.Parameters.AddWithValue("@route", (object)target.Route?.Id ?? DBNull.Value);
                            command.Parameters.AddWithValue("@mode", target.Route?.Mode ?? PrintConstants.Failover);
                            command.Parameters.AddWithValue("@target", index);
                            command.Parameters.AddWithValue("@payload", JsonConvert.SerializeObject(submission));
                            command.Parameters.AddWithValue("@now", Utc(DateTime.UtcNow));
                            command.ExecuteNonQuery();
                        }
                    }
                }
                transaction.Commit();
            }
            result.AddRange(GetGroup(groupId));
            return result;
        }

        public List<LocalPrintTask> GetReady(int limit)
        {
            var jobs = new List<LocalPrintTask>();
            lock (sync)
            using (var command = connection.CreateCommand())
            {
                command.CommandText = @"
SELECT * FROM local_jobs
WHERE status IN ('QUEUED', 'RETRY_WAIT')
  AND (next_attempt_at_utc IS NULL OR next_attempt_at_utc <= @now)
ORDER BY created_at_utc, target_index
LIMIT @limit;";
                command.Parameters.AddWithValue("@now", Utc(DateTime.UtcNow));
                command.Parameters.AddWithValue("@limit", Math.Max(1, limit));
                using (var reader = command.ExecuteReader())
                {
                    while (reader.Read()) jobs.Add(Read(reader));
                }
            }
            return jobs;
        }

        public List<LocalPrintTask> GetGroup(string groupId)
        {
            var jobs = new List<LocalPrintTask>();
            lock (sync)
            using (var command = connection.CreateCommand())
            {
                command.CommandText = "SELECT * FROM local_jobs WHERE group_id=@group ORDER BY target_index;";
                command.Parameters.AddWithValue("@group", groupId);
                using (var reader = command.ExecuteReader())
                {
                    while (reader.Read()) jobs.Add(Read(reader));
                }
            }
            return jobs;
        }

        public List<LocalPrintTask> Recent(int limit)
        {
            var jobs = new List<LocalPrintTask>();
            lock (sync)
            using (var command = connection.CreateCommand())
            {
                command.CommandText = "SELECT * FROM local_jobs ORDER BY id DESC LIMIT @limit;";
                command.Parameters.AddWithValue("@limit", Math.Max(1, limit));
                using (var reader = command.ExecuteReader())
                {
                    while (reader.Read()) jobs.Add(Read(reader));
                }
            }
            return jobs;
        }

        public int CountPending()
        {
            lock (sync)
            using (var command = connection.CreateCommand())
            {
                command.CommandText = "SELECT COUNT(*) FROM local_jobs WHERE status NOT IN ('SPOOLED','COMPLETED','PRINTED','CANCELLED');";
                return Convert.ToInt32(command.ExecuteScalar(), CultureInfo.InvariantCulture);
            }
        }

        public void Mark(long id, string status, string message = null, string spoolJobId = null, DateTime? nextAttempt = null)
        {
            lock (sync)
            using (var command = connection.CreateCommand())
            {
                command.CommandText = @"
UPDATE local_jobs
SET status=@status,
    attempts=CASE WHEN @status='PRINTING' THEN attempts+1 ELSE attempts END,
    error_message=@message,
    spool_job_id=COALESCE(@spool, spool_job_id),
    next_attempt_at_utc=@next,
    updated_at_utc=@now
WHERE id=@id;";
                command.Parameters.AddWithValue("@status", status);
                command.Parameters.AddWithValue("@message", (object)message ?? DBNull.Value);
                command.Parameters.AddWithValue("@spool", (object)spoolJobId ?? DBNull.Value);
                command.Parameters.AddWithValue("@next", nextAttempt.HasValue ? (object)Utc(nextAttempt.Value) : DBNull.Value);
                command.Parameters.AddWithValue("@now", Utc(DateTime.UtcNow));
                command.Parameters.AddWithValue("@id", id);
                command.ExecuteNonQuery();
            }
            RecordAttempt(id, status, message, spoolJobId);
        }

        private void RecordAttempt(long id, string status, string message, string spoolJobId)
        {
            lock (sync)
            using (var command = connection.CreateCommand())
            {
                command.CommandText = @"
INSERT INTO local_job_attempts (
    local_job_id, attempt_number, status, message, spool_job_id, created_at_utc
)
SELECT id, attempts, @status, @message, @spool, @now
FROM local_jobs
WHERE id=@id;";
                command.Parameters.AddWithValue("@status", status);
                command.Parameters.AddWithValue("@message", (object)message ?? DBNull.Value);
                command.Parameters.AddWithValue("@spool", (object)spoolJobId ?? DBNull.Value);
                command.Parameters.AddWithValue("@now", Utc(DateTime.UtcNow));
                command.Parameters.AddWithValue("@id", id);
                command.ExecuteNonQuery();
            }
        }

        private void RecoverInterruptedTasks()
        {
            Execute(@"
UPDATE local_jobs
SET status = CASE WHEN UPPER(job_kind)='KOT' THEN 'RETRY_WAIT' ELSE 'HELD_AMBIGUOUS' END,
    error_message = 'Service restarted while the printer outcome was unknown',
    next_attempt_at_utc = CASE WHEN UPPER(job_kind)='KOT' THEN datetime('now', '+5 seconds') ELSE NULL END,
    updated_at_utc = datetime('now')
WHERE status='PRINTING';");
        }

        private void Execute(string sql)
        {
            lock (sync)
            using (var command = connection.CreateCommand())
            {
                command.CommandText = sql;
                command.ExecuteNonQuery();
            }
        }

        private static LocalPrintTask Read(SQLiteDataReader reader)
        {
            return new LocalPrintTask
            {
                Id = Convert.ToInt64(reader["id"], CultureInfo.InvariantCulture),
                GroupId = Convert.ToString(reader["group_id"]),
                CloudJobId = DbString(reader, "cloud_job_id"),
                LeaseToken = DbString(reader, "lease_token"),
                IdempotencyKey = Convert.ToString(reader["idempotency_key"]),
                JobKind = Convert.ToString(reader["job_kind"]),
                ProfileId = Convert.ToString(reader["profile_id"]),
                RouteId = DbString(reader, "route_id"),
                Mode = Convert.ToString(reader["route_mode"]),
                TargetIndex = Convert.ToInt32(reader["target_index"], CultureInfo.InvariantCulture),
                Attempts = Convert.ToInt32(reader["attempts"], CultureInfo.InvariantCulture),
                Status = Convert.ToString(reader["status"]),
                PayloadJson = Convert.ToString(reader["payload_json"]),
                ErrorMessage = DbString(reader, "error_message"),
                SpoolJobId = DbString(reader, "spool_job_id"),
                CreatedAtUtc = DateTime.Parse(Convert.ToString(reader["created_at_utc"]), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind),
                NextAttemptAtUtc = ParseNullable(DbString(reader, "next_attempt_at_utc"))
            };
        }

        private static string DbString(SQLiteDataReader reader, string name) =>
            reader[name] == DBNull.Value ? null : Convert.ToString(reader[name]);

        private static DateTime? ParseNullable(string value) =>
            string.IsNullOrWhiteSpace(value)
                ? (DateTime?)null
                : DateTime.Parse(value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind);

        private static string Utc(DateTime value) => value.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture);

        public void Dispose() => connection.Dispose();
    }
}
