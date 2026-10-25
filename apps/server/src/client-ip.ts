import { BlockList, isIP } from "node:net";
import type { FastifyRequest } from "fastify";

// Cloudflare's published proxy ranges (https://www.cloudflare.com/ips/). Only requests that arrive from these
// addresses may name the visitor with CF-Connecting-IP, so the header can't be forged by going around Cloudflare.
const CLOUDFLARE_V4 = ["173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13", "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22"];
const CLOUDFLARE_V6 = ["2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32"];

export function buildCloudflareList(v4: string[] = CLOUDFLARE_V4, v6: string[] = CLOUDFLARE_V6) {
  const list = new BlockList();
  for (const range of v4) {
    const [address, prefix] = range.split("/") as [string, string];
    list.addSubnet(address, Number(prefix), "ipv4");
  }
  for (const range of v6) {
    const [address, prefix] = range.split("/") as [string, string];
    list.addSubnet(address, Number(prefix), "ipv6");
  }
  return list;
}

const cloudflare = buildCloudflareList();

export function fromCloudflare(address: string, list = cloudflare) {
  const family = isIP(address);
  return family !== 0 && list.check(address, family === 4 ? "ipv4" : "ipv6");
}

// The visitor's address: CF-Connecting-IP when the request really came through Cloudflare, otherwise the trusted-proxy address.
export function clientIp(request: Pick<FastifyRequest, "ip" | "headers">, list = cloudflare) {
  const header = request.headers["cf-connecting-ip"];
  const value = typeof header === "string" ? header.trim() : "";
  return fromCloudflare(request.ip, list) && isIP(value) !== 0 ? value : request.ip;
}
