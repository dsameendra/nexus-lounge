"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, adminCookieOptions, adminIdentity, loginLocked, recordLoginFailure, verifyLogin } from "@/lib/admin";

export async function loginAction(formData: FormData) {
  const sub = await adminIdentity();
  if (!sub) redirect("/admin/login?error=1");
  if (loginLocked(sub)) redirect("/admin/login?error=locked");
  const cookie = verifyLogin(sub, String(formData.get("code") ?? ""));
  if (!cookie) {
    recordLoginFailure(sub);
    redirect("/admin/login?error=1");
  }
  (await cookies()).set(ADMIN_COOKIE, cookie, adminCookieOptions);
  redirect("/admin");
}

export async function logoutAction() {
  (await cookies()).set(ADMIN_COOKIE, "", { ...adminCookieOptions, maxAge: 0 });
  redirect("/");
}
