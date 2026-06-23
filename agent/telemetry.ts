import { context, SpanStatusCode, trace, type Attributes } from "@opentelemetry/api";
import { ConsoleSpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { loadEnv } from "./env";
import { redact } from "./redact";

loadEnv();

let initialized = false;
let provider: NodeTracerProvider | undefined;

function telemetryEnabled() {
  return process.env.OTEL_ENABLED === "true";
}

function serviceName() {
  return process.env.OTEL_SERVICE_NAME || "website-qa-agent";
}

export function initTelemetry() {
  if (!telemetryEnabled() || initialized) return;

  const exporter =
    process.env.OTEL_TRACES_EXPORTER === "otlp"
      ? new OTLPTraceExporter({
          url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || undefined,
        })
      : new ConsoleSpanExporter();

  provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName(),
    }),
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });

  provider.register();
  initialized = true;
}

export function tracer() {
  initTelemetry();
  return trace.getTracer(serviceName());
}

function safeAttributes(attributes: Attributes = {}) {
  return Object.fromEntries(
    Object.entries(attributes).map(([key, value]) => [key, typeof value === "string" ? redact(value, 500) : value]),
  );
}

export async function withSpan<T>(name: string, attributes: Attributes, fn: () => Promise<T>): Promise<T> {
  if (!telemetryEnabled()) return fn();

  return tracer().startActiveSpan(name, { attributes: safeAttributes(attributes) }, async (span) => {
    try {
      const result = await context.with(trace.setSpan(context.active(), span), fn);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error: any) {
      span.recordException(redact(error?.message ?? error, 1000));
      span.setStatus({ code: SpanStatusCode.ERROR, message: redact(error?.message ?? error, 300) });
      throw error;
    } finally {
      span.end();
    }
  });
}

export function setSpanAttributes(attributes: Attributes) {
  const span = trace.getActiveSpan();
  if (span) span.setAttributes(safeAttributes(attributes));
}

export async function shutdownTelemetry() {
  if (provider) await provider.shutdown();
  provider = undefined;
  initialized = false;
}
