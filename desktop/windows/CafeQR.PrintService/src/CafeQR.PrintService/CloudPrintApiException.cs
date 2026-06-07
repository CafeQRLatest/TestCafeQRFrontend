using System;

namespace CafeQR.PrintService
{
    internal sealed class CloudPrintApiException : Exception
    {
        public CloudPrintApiException(int statusCode, string responseBody)
            : base("Cloud print API failed: " + statusCode + " " + responseBody)
        {
            StatusCode = statusCode;
            ResponseBody = responseBody ?? "";
        }

        public int StatusCode { get; }
        public string ResponseBody { get; }

        public bool IsAuthenticationFailure =>
            StatusCode == 401
            || StatusCode == 403
            || (StatusCode == 400
                && ResponseBody.IndexOf("station token", StringComparison.OrdinalIgnoreCase) >= 0);

        public bool IsConflict => StatusCode == 409;
    }
}
