import assert from "node:assert/strict";
import { test } from "node:test";
import { clientIp, fromCloudflare } from "../src/client-ip.ts";

const request = (ip: string, headers: Record<string, string> = {}) => ({ ip, headers });

test("CF-Connecting-IP is trusted only from Cloudflare addresses", () => {
  assert.equal(fromCloudflare("172.71.202.10"), true);
  assert.equal(fromCloudflare("2606:4700:3035::6815:5cba"), true);
  assert.equal(fromCloudflare("203.0.113.5"), false);
  assert.equal(fromCloudflare("not-an-ip"), false);

  assert.equal(clientIp(request("172.71.202.10", { "cf-connecting-ip": "198.51.100.7" })), "198.51.100.7");
  assert.equal(clientIp(request("203.0.113.5", { "cf-connecting-ip": "198.51.100.7" })), "203.0.113.5", "forged header from a non-Cloudflare peer is ignored");
  assert.equal(clientIp(request("172.71.202.10", { "cf-connecting-ip": "garbage" })), "172.71.202.10", "invalid header falls back");
  assert.equal(clientIp(request("172.71.202.10")), "172.71.202.10");
  assert.equal(clientIp(request("2606:4700:3035::6815:5cba", { "cf-connecting-ip": "2001:db8::1" })), "2001:db8::1");
});
