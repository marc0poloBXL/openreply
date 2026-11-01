import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  getEncryptionKeyHex,
  getMetaGraphApiVersion,
  requireEnv,
} from "../lib/env";

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe("environment helpers", () => {
  it("requires missing variables", () => {
    expect(() => requireEnv("MISSING_TEST_ENV")).toThrow(
      "MISSING_TEST_ENV environment variable is required"
    );
  });

  it("validates the encryption key format", () => {
    vi.stubEnv("ENCRYPTION_KEY", "not-hex");
    expect(() => getEncryptionKeyHex()).toThrow(
      "ENCRYPTION_KEY must be a 32-byte hex string"
    );
  });

  it("defaults Meta Graph API version in one place", () => {
    expect(getMetaGraphApiVersion()).toBe("v26.0");
    vi.stubEnv("META_GRAPH_API_VERSION", "v25.0");
    expect(getMetaGraphApiVersion()).toBe("v25.0");
  });

  it("strips a leading BOM from env values", () => {
    // A credential pasted from a BOM-prefixed UTF-8 file arrives with an
    // invisible U+FEFF glued on. Meta rejects it as malformed, so requireEnv
    // must hand back the clean value.
    vi.stubEnv("BOM_TEST_ENV", "﻿abc123");
    expect(requireEnv("BOM_TEST_ENV")).toBe("abc123");
  });

  it("strips surrounding whitespace from env values", () => {
    vi.stubEnv("SPACE_TEST_ENV", "  abc123\n");
    expect(requireEnv("SPACE_TEST_ENV")).toBe("abc123");
  });
});
