---
title: "RB-02 Mosquitto (site MQTT broker) down"
status: draft
edition: community
related:
  - ../09-messaging.md
---

# RB-02 Mosquitto (site MQTT broker) down

**Symptoms:** MQTT clients disconnected, no inbound telemetry from a site, edge agents reporting reconnect attempts.

**Impact:** No telemetry reaches the platform from that site. Edge agents keep detecting locally and buffer.

## Diagnose
- Confirm whether the broker process, its network path or its certificates failed.
- Check client connection counts and queued-message metrics (`$SYS` exporter).
- Check edge agent buffer fill level.

## Mitigate
- Restart the broker; confirm persistence loaded queued messages.
- If certificates expired, rotate them (see the security procedure) and reconnect clients.
- If a warm standby exists, fail clients over.

## Recover
- Edge agents replay buffered data in order after reconnect.
- Verify no sequence gaps and no duplicate effects.

## Verify
- Connected clients match the expected count.
- Telemetry for the site resumes and lag returns to normal.

## Escalate
Escalate to the project owner if the cause is unclear after the diagnose steps or if the incident affects safety invariants. Record what was done and when.

## Related
doc/09-messaging.md section 3; ING-2, NFR-S4

> Commands and dashboard names will be added when the services exist (verify).
