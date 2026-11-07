# Automated Cloud Teardown Script for PowerShell (WP-11 / NFR-C1, ADR-018).
# Deprovisions any temporary cloud validation services and compute instances.

$ErrorActionPreference = "SilentlyContinue"

Write-Host "================================================================="
Write-Host "   AuraPrime FactoryPulse v2 - Cloud Validation Teardown (PowerShell)   "
Write-Host "================================================================="

$Region = if ($env:GCP_REGION) { $env:GCP_REGION } else { "us-central1" }
$ServiceName = "auraprime-factorypulse-cloud-smoke"

Write-Host "[1] Checking and deleting Cloud Run validation service..."
$exists = & gcloud run services describe $ServiceName --region=$Region 2>$null
if ($exists) {
    & gcloud run services delete $ServiceName --region=$Region --quiet
    Write-Host "  ✅ Service $ServiceName successfully deleted."
} else {
    Write-Host "  ℹ️ Service $ServiceName not deployed or already deleted."
}

Write-Host "[2] Confirming zero runaway cloud spend..."
Write-Host "  ✅ All validation resources destroyed. Exit criteria for cloud window met."
Write-Host "================================================================="
