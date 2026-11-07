# Acme press hydraulic unit: equipment manual

Synthetic sample document for the Acme Test Plant tenant (ADR-019). Not a real manufacturer manual.

## Purpose

This manual describes the hydraulic unit that powers the forming press at the Acme press station on Acme line 1. It is written for maintenance technicians and the reliability engineer who look after the unit.

## Equipment

The unit is registered as asset as-x-press (Acme press hydraulics). It has a gear pump driven by an electric motor, a pressure relief valve, a return-line filter with a clogging indicator, an oil cooler and a reservoir with a sight glass. The clamp circuit pressure is measured by pressure sensor PT-X1, which reports to the plant gateway over MQTT.

## Specifications

The clamp circuit is designed to run at about 4.2 bar during a press cycle. The live normal range for PT-X1 is held in the equipment registry and shown on the Plant screen; always use the registry value rather than this text when judging a reading. The reservoir holds hydraulic oil of the grade named on the unit nameplate.

## Maintenance

Check the oil level in the sight glass at the start of every shift. Inspect hoses and fittings for leaks once a week. Replace the return-line filter element when the clogging indicator turns red or every 1,000 operating hours, whichever comes first. Take an oil sample for analysis every 2,000 operating hours.

## Safety

Stored hydraulic pressure can move the press ram after the motor stops. Before any work, stop the press, apply lockout to the motor isolator, open the dump valve and confirm that PT-X1 reads zero. Wear safety glasses and oil-resistant gloves, and clean up spilled oil at once to prevent slips.
