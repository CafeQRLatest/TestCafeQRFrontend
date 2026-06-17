using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace CafeQR.PrintService
{
    internal sealed class PrintConfigurationException : InvalidOperationException
    {
        public PrintConfigurationException(string jobKind)
            : base($"No {jobKind.ToUpperInvariant()} printer configured. Open Settings -> Hardware.")
        {
            JobKind = jobKind.ToUpperInvariant();
        }

        public string JobKind { get; }
    }

    internal sealed class RoutingEngine
    {
        public IReadOnlyList<PrinterProfile> Profiles(JObject configuration)
        {
            var regularTemplate = configuration?["regularTemplate"] as JObject ?? new JObject();
            return (configuration?["profiles"] as JArray ?? new JArray())
                .OfType<JObject>()
                .Select(profile =>
                {
                    var format = profile.Value<string>("format") ?? PrintConstants.Thermal;
                    var merged = (JObject)(format.Equals(PrintConstants.Regular, StringComparison.OrdinalIgnoreCase)
                        ? regularTemplate.DeepClone()
                        : new JObject());
                    merged.Merge(profile, new JsonMergeSettings { MergeArrayHandling = MergeArrayHandling.Replace });
                    return merged.ToObject<PrinterProfile>();
                })
                .Where(profile => profile.Enabled && !string.IsNullOrWhiteSpace(profile.Id))
                .ToList();
        }

        public IReadOnlyList<RoutedTarget> Resolve(LocalJobSubmission submission, JObject configuration)
        {
            var profiles = Profiles(configuration).ToDictionary(value => value.Id, StringComparer.OrdinalIgnoreCase);
            var routes = (configuration?["routes"] as JArray ?? new JArray())
                .ToObject<List<PrintRoute>>()
                .Where(value => value.Enabled)
                .OrderBy(value => value.Priority)
                .ToList();
            var kind = (submission.JobKind ?? "bill").ToUpperInvariant();
            var categories = Categories(submission);
            var orderType = ReadString(submission, "orderType", "order_type", "fulfillmentType", "fulfillment_type");

            var explicitRoute = !string.IsNullOrWhiteSpace(submission.RouteId)
                ? routes.FirstOrDefault(value => value.Id.Equals(submission.RouteId, StringComparison.OrdinalIgnoreCase))
                : null;
            var route = explicitRoute ?? routes.FirstOrDefault(value =>
                Matches(value.DocumentTypes, kind)
                && MatchesOptional(value.OrderTypes, orderType)
                && MatchesCategories(value.Categories, categories));

            var profileIds = new List<string>();
            if (!string.IsNullOrWhiteSpace(submission.PrinterProfileId))
            {
                profileIds.Add(submission.PrinterProfileId);
            }
            else if (route != null)
            {
                profileIds.AddRange(route.ProfileIds);
            }
            else
            {
                profileIds.AddRange(DefaultProfiles(submission, configuration, profiles.Values));
            }

            var targets = new List<RoutedTarget>();
            var targetIndex = 0;
            var defaultMode = DefaultMode(kind, configuration);
            foreach (var profileId in profileIds.Distinct(StringComparer.OrdinalIgnoreCase))
            {
                if (!profiles.TryGetValue(profileId, out var profile)) continue;
                if (!kind.Equals("TEST", StringComparison.OrdinalIgnoreCase)
                    && profile.Documents.Count > 0 && !profile.Documents.Any(value =>
                    value.Equals(kind, StringComparison.OrdinalIgnoreCase))) continue;
                targets.Add(new RoutedTarget
                {
                    Route = route ?? new PrintRoute
                    {
                        Id = "default-" + kind.ToLowerInvariant(),
                        Name = "Default " + kind,
                        Mode = defaultMode,
                        Copies = 1
                    },
                    Profile = profile,
                    Copies = Math.Max(1, (route?.Copies ?? 1) * Math.Max(1, profile.Copies)),
                    TargetIndex = targetIndex++
                });
            }

            if (targets.Count == 0)
            {
                throw new PrintConfigurationException(kind);
            }
            return targets;
        }

        private static string DefaultMode(string kind, JObject configuration)
        {
            var defaults = configuration?["defaults"] as JObject ?? new JObject();
            var key = DefaultKey(kind, "Mode");
            return string.Equals(defaults.Value<string>(key), PrintConstants.Failover, StringComparison.OrdinalIgnoreCase)
                ? PrintConstants.Failover
                : PrintConstants.Mirror;
        }

        private static IEnumerable<string> DefaultProfiles(
            LocalJobSubmission submission,
            JObject configuration,
            IEnumerable<PrinterProfile> profiles)
        {
            var defaults = configuration?["defaults"] as JObject ?? new JObject();
            var kind = (submission.JobKind ?? "bill").ToUpperInvariant();
            var configured = defaults[DefaultKey(kind, "ProfileIds")] as JArray;
            if (configured != null && configured.Count > 0)
            {
                return configured.Values<string>().Where(value => !string.IsNullOrWhiteSpace(value));
            }
            if (HasAnyDocumentDefaults(defaults))
            {
                return Enumerable.Empty<string>();
            }

            var output = submission.OutputFormat;
            if (string.IsNullOrWhiteSpace(output))
            {
                var fallback = kind == "INVOICE" ? PrintConstants.Regular : PrintConstants.Thermal;
                output = defaults.Value<string>(DefaultKey(kind, "Output")) ?? fallback;
            }

            return profiles
                .Where(profile => output.Equals(PrintConstants.Both, StringComparison.OrdinalIgnoreCase)
                    || profile.Format.Equals(output, StringComparison.OrdinalIgnoreCase))
                .Where(profile => profile.Documents == null
                    || profile.Documents.Count == 0
                    || profile.Documents.Any(value => value.Equals(kind, StringComparison.OrdinalIgnoreCase)))
                .Select(profile => profile.Id);
        }

        private static bool HasAnyDocumentDefaults(JObject defaults)
        {
            return HasDefaultProfiles(defaults, "kotProfileIds")
                || HasDefaultProfiles(defaults, "billProfileIds")
                || HasDefaultProfiles(defaults, "invoiceProfileIds");
        }

        private static bool HasDefaultProfiles(JObject defaults, string key)
        {
            var configured = defaults?[key] as JArray;
            return configured != null && configured.Values<string>().Any(value => !string.IsNullOrWhiteSpace(value));
        }

        private static string DefaultKey(string kind, string suffix)
        {
            var prefix = kind == "KOT"
                ? "kot"
                : kind == "INVOICE"
                    ? "invoice"
                    : "bill";
            return prefix + suffix;
        }

        private static bool Matches(IReadOnlyCollection<string> allowed, string value) =>
            allowed == null || allowed.Count == 0
            || allowed.Any(item => item.Equals(value, StringComparison.OrdinalIgnoreCase));

        private static bool MatchesOptional(IReadOnlyCollection<string> allowed, string value) =>
            allowed == null || allowed.Count == 0
            || (!string.IsNullOrWhiteSpace(value)
                && allowed.Any(item => item.Equals(value, StringComparison.OrdinalIgnoreCase)));

        private static bool MatchesCategories(IReadOnlyCollection<string> allowed, HashSet<string> categories) =>
            allowed == null || allowed.Count == 0
            || allowed.Any(categories.Contains);

        private static HashSet<string> Categories(LocalJobSubmission submission)
        {
            var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var document = submission.Document ?? submission.Metadata ?? new JObject();
            var lines = document["lines"] as JArray
                ?? document["orderLines"] as JArray
                ?? document["order_items"] as JArray
                ?? document.SelectToken("order.lines") as JArray
                ?? new JArray();
            foreach (var line in lines.OfType<JObject>())
            {
                var category = line.Value<string>("categoryName")
                    ?? line.Value<string>("category_name")
                    ?? line.Value<string>("category");
                if (!string.IsNullOrWhiteSpace(category)) result.Add(category.Trim());
            }
            return result;
        }

        private static string ReadString(LocalJobSubmission submission, params string[] names)
        {
            var document = submission.Document ?? submission.Metadata ?? new JObject();
            foreach (var name in names)
            {
                var value = document.Value<string>(name) ?? document.SelectToken("order." + name)?.Value<string>();
                if (!string.IsNullOrWhiteSpace(value)) return value;
            }
            return null;
        }
    }
}
