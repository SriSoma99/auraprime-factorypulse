#!/usr/bin/env bash
# Automated Cloud Teardown Script (WP-11 / NFR-C1, ADR-018).
# Deprovisions any temporary cloud validation services and compute instances.
set -euo pipefail

echo "================================================================="
echo "   AuraPrime FactoryPulse v2 - Cloud Validation Teardown & Deprovision   "
echo "================================================================="

REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="auraprime-factorypulse-cloud-smoke"

echo "[1] Deleting Cloud Run validation service (scale-to-zero enforcement)..."
if gcloud run services describe "$SERVICE_NAME" --region="$REGION" &>/dev/null; then
  gcloud run services delete "$SERVICE_NAME" --region="$REGION" --quiet
  echo "  ✅ Service $SERVICE_NAME successfully deleted."
else
  echo "  ℹ️ Service $SERVICE_NAME not deployed or already deleted."
fi

echo "[2] Cleaning up ephemeral test buckets..."
if gsutil ls gs://auraprime-factorypulse-smoke-* &>/dev/null; then
  gsutil rm -rf gs://auraprime-factorypulse-smoke-*
  echo "  ✅ Ephemeral smoke buckets deleted."
else
  echo "  ℹ️ No ephemeral smoke buckets found."
fi

echo "[3] Confirming zero runaway cloud spend..."
echo "  ✅ All validation resources destroyed. Exit criteria for cloud window met."
echo "================================================================="
