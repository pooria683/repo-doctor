import assert from "node:assert/strict";
import test from "node:test";

import { makeFixture, scanFixture } from "./helpers.js";

const BAD_DOCKERFILE = `FROM node:latest
ENV API_KEY=abcdef123456
RUN curl -fsSL https://example.com/install.sh | bash
RUN apt-get update && apt-get install -y curl
ADD https://example.com/app.tar.gz /app
COPY . /app
CMD ["node", "index.js"]
`;

const GOOD_DOCKERFILE = `FROM node:22.11-bookworm-slim@sha256:1234
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
USER 10001:10001
CMD ["node", "index.js"]
`;

test("containers: a careless Dockerfile triggers the full rule set", async () => {
  const fixture = makeFixture({ Dockerfile: BAD_DOCKERFILE });
  try {
    const { result } = await scanFixture(fixture.root);
    const ids = new Set(result.findings.filter((f) => f.category === "containers").map((f) => f.ruleId));
    assert.ok(ids.has("containers/dockerfile-root-user"), "root user");
    assert.ok(ids.has("containers/dockerfile-unpinned-base"), "unpinned base");
    assert.ok(ids.has("containers/dockerfile-curl-pipe-shell"), "curl pipe");
    assert.ok(ids.has("containers/dockerfile-secret-in-env"), "secret in env");
    assert.ok(ids.has("containers/dockerfile-add-remote"), "remote add");
    assert.ok(ids.has("containers/dockerfile-apt-cleanup"), "apt cleanup");
    assert.ok(ids.has("containers/dockerignore-missing"), "missing dockerignore");
  } finally {
    fixture.cleanup();
  }
});

test("containers: the ENV secret value is masked in evidence", async () => {
  const fixture = makeFixture({ Dockerfile: "FROM node:22\nENV API_KEY=abcdef123456\n" });
  try {
    const { result } = await scanFixture(fixture.root);
    const finding = result.findings.find((candidate) => candidate.ruleId === "containers/dockerfile-secret-in-env");
    assert.ok(finding);
    assert.equal(JSON.stringify(result).includes("abcdef123456"), false);
  } finally {
    fixture.cleanup();
  }
});

test("containers: a hardened Dockerfile passes", async () => {
  const fixture = makeFixture({ Dockerfile: GOOD_DOCKERFILE, ".dockerignore": ".git\nnode_modules\n.env\n" });
  try {
    const { result } = await scanFixture(fixture.root);
    const containerFindings = result.findings.filter((finding) => finding.category === "containers");
    assert.deepEqual(
      containerFindings.map((finding) => finding.ruleId),
      [],
      `unexpected: ${containerFindings.map((finding) => `${finding.ruleId}: ${finding.message}`).join(" | ")}`,
    );
  } finally {
    fixture.cleanup();
  }
});

test("containers: compose privileged and docker socket mounts are reported", async () => {
  const fixture = makeFixture({
    "docker-compose.yml": [
      "services:",
      "  app:",
      "    image: app",
      "    privileged: true",
      "    volumes:",
      "      - /var/run/docker.sock:/var/run/docker.sock",
      "    network_mode: host",
    ].join("\n"),
  });
  try {
    const { result } = await scanFixture(fixture.root);
    const findings = result.findings.filter((finding) => finding.ruleId === "containers/compose-privileged");
    assert.equal(findings.length, 3);
    assert.ok(findings.some((finding) => /privileged/.test(finding.message)));
    assert.ok(findings.some((finding) => /socket/.test(finding.message)));
    assert.ok(findings.some((finding) => /host networking/.test(finding.message)));
  } finally {
    fixture.cleanup();
  }
});
