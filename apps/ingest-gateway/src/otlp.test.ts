import { describe, it, expect } from "vitest";
import { decodeOtlpMetrics, nanoToIsoString, defaultResolveStation } from "./otlp.js";

const sampleUserOtlpPayload = {
  resourceMetrics: [
    {
      resource: {
        attributes: [
          { key: "factory.site.id", value: { stringValue: "SITE-DEMO" } },
          { key: "factory.line.id", value: { stringValue: "LINE-01" } },
          { key: "factory.machine.id", value: { stringValue: "M-01" } },
          { key: "service.name", value: { stringValue: "demo-replay" } },
          { key: "factory.data.synthetic", value: { boolValue: true } },
        ],
      },
      scopeMetrics: [
        {
          scope: { name: "factorypulse.replay", version: "1" },
          metrics: [
            {
              name: "machine.spindle.speed",
              unit: "{rpm}",
              gauge: {
                dataPoints: [
                  {
                    timeUnixNano: "1793869260000000000",
                    asDouble: 5896.8,
                    attributes: [{ key: "factory.sensor.id", value: { stringValue: "S-01-SPD" } }],
                  },
                ],
              },
            },
            {
              name: "machine.vibration.velocity.rms",
              unit: "mm/s",
              gauge: {
                dataPoints: [
                  {
                    timeUnixNano: "1793869260000000000",
                    asDouble: 2.264,
                    attributes: [{ key: "factory.sensor.id", value: { stringValue: "S-01-VIB" } }],
                  },
                ],
              },
            },
            {
              name: "machine.temperature",
              unit: "Cel",
              gauge: {
                dataPoints: [
                  {
                    timeUnixNano: "1793869260000000000",
                    asDouble: 47.0,
                    attributes: [{ key: "factory.sensor.id", value: { stringValue: "S-01-TMP" } }],
                  },
                ],
              },
            },
          ],
        },
      ],
    },
    {
      resource: {
        attributes: [
          { key: "factory.site.id", value: { stringValue: "SITE-DEMO" } },
          { key: "factory.line.id", value: { stringValue: "LINE-01" } },
          { key: "factory.machine.id", value: { stringValue: "M-05" } },
          { key: "service.name", value: { stringValue: "demo-replay" } },
          { key: "factory.data.synthetic", value: { boolValue: true } },
        ],
      },
      scopeMetrics: [
        {
          scope: { name: "factorypulse.replay", version: "1" },
          metrics: [
            {
              name: "machine.spindle.speed",
              unit: "{rpm}",
              gauge: {
                dataPoints: [
                  {
                    timeUnixNano: "1793869260000000000",
                    asDouble: 4.2,
                    attributes: [{ key: "factory.sensor.id", value: { stringValue: "S-05-SPD" } }],
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  ],
};

describe("OTLP Metrics Decoder (APP-02)", () => {
  it("converts nanosecond timestamps into valid ISO 8601 strings", () => {
    // 1793869260000000000 ns = 1793869260000 ms
    const iso = nanoToIsoString("1793869260000000000");
    expect(iso).toBe(new Date(1793869260000).toISOString());
  });

  it("maps machine IDs M-01 .. M-10 to station IDs ST-01 .. ST-10", () => {
    expect(defaultResolveStation("M-01")).toBe("ST-01");
    expect(defaultResolveStation("M-05")).toBe("ST-05");
    expect(defaultResolveStation("M-10")).toBe("ST-10");
  });

  it("decodes standard OTLP metrics JSON into ValidatedTelemetryEnvelope records", () => {
    const result = decodeOtlpMetrics(sampleUserOtlpPayload, {
      tenantId: "t-demo",
    });

    expect(result.success).toBe(true);
    expect(result.dlqErrors).toHaveLength(0);
    expect(result.envelopes).toHaveLength(4);
    expect(result.summary.totalResources).toBe(2);
    expect(result.summary.totalMetrics).toBe(4);
    expect(result.summary.validCount).toBe(4);

    // M-01 Spindle speed verification
    const m1Spd = result.envelopes.find((e) => e.sensor_id === "S-01-SPD");
    expect(m1Spd).toBeDefined();
    expect(m1Spd!.site_id).toBe("SITE-DEMO");
    expect(m1Spd!.line_id).toBe("LINE-01");
    expect(m1Spd!.station_id).toBe("ST-01");
    expect(m1Spd!.asset_id).toBe("M-01");
    expect(m1Spd!.value).toBe(5896.8);
    expect(m1Spd!.quality_flag).toBe("good");
    expect(m1Spd!.is_synthetic).toBe(true);
    expect(m1Spd!.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);

    // M-05 Stopped speed verification
    const m5Spd = result.envelopes.find((e) => e.sensor_id === "S-05-SPD");
    expect(m5Spd).toBeDefined();
    expect(m5Spd!.asset_id).toBe("M-05");
    expect(m5Spd!.station_id).toBe("ST-05");
    expect(m5Spd!.value).toBe(4.2);
  });

  it("routes malformed OTLP payloads to DLQ", () => {
    const invalidPayload = { invalidField: true };
    const result = decodeOtlpMetrics(invalidPayload, { tenantId: "t-demo" });

    expect(result.success).toBe(false);
    expect(result.envelopes).toHaveLength(0);
    expect(result.dlqErrors).toHaveLength(1);
    expect(result.dlqErrors[0]!.reason).toBe("schema_validation_failed");
  });

  it("handles integer values (asInt) gracefully", () => {
    const payloadWithInt = {
      resourceMetrics: [
        {
          resource: {
            attributes: [
              { key: "factory.site.id", value: { stringValue: "SITE-DEMO" } },
              { key: "factory.line.id", value: { stringValue: "LINE-01" } },
              { key: "factory.machine.id", value: { stringValue: "M-02" } },
            ],
          },
          scopeMetrics: [
            {
              metrics: [
                {
                  name: "machine.spindle.speed",
                  gauge: {
                    dataPoints: [
                      {
                        timeUnixNano: "1793869260000000000",
                        asInt: 6000,
                        attributes: [{ key: "factory.sensor.id", value: { stringValue: "S-02-SPD" } }],
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const result = decodeOtlpMetrics(payloadWithInt, { tenantId: "t-demo" });
    expect(result.success).toBe(true);
    expect(result.envelopes).toHaveLength(1);
    expect(result.envelopes[0]!.value).toBe(6000);
  });
});
