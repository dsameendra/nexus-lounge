import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms of Service · Nexus Lounge" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="25 October 2026">
      <p>
        Nexus Lounge is a free, general-purpose virtual watch-party app: you create or join a room, watch YouTube and Twitch together in sync, talk by voice, chat and share your screen. By using it you agree to these terms.
      </p>

      <section>
        <h2>Using the app</h2>
        <ul>
          <li>You can sign in with Discord or join as a guest. Guests can watch, talk and chat; creating a room needs Discord.</li>
          <li>You are responsible for what you say, share and play in a room, including screen shares, voice and chat.</li>
          <li>Don&apos;t use the app to harass others, share illegal content, share content you have no right to share, or disrupt the service or other people&apos;s rooms.</li>
          <li>Room hosts can remove people and control what plays. Hosts and the operator may remove anyone who breaks these terms.</li>
        </ul>
      </section>

      <section>
        <h2>Third-party content</h2>
        <p>
          Videos and streams come from YouTube and Twitch and play in their own embedded players. Their terms and privacy policies apply to that content, and Nexus Lounge doesn&apos;t host, copy or store it. Content may be unavailable if its owner restricts embedding.
        </p>
      </section>

      <section>
        <h2>Your account</h2>
        <p>
          You can change your display name and avatar, and delete your account at any time from the account page (when you&apos;re not in a room). Deleting signs you out and removes your profile and your traces from rooms stored by the service.
        </p>
      </section>

      <section>
        <h2>No warranty</h2>
        <p>
          The app is provided &ldquo;as is&rdquo;, without warranties of any kind. Rooms are kept in memory and disappear when they end or when the service restarts, so don&apos;t rely on it for anything you can&apos;t lose. To the extent the law allows, the operator isn&apos;t liable for damages arising from your use of the app.
        </p>
      </section>

      <section>
        <h2>Changes and contact</h2>
        <p>
          These terms may change; the date above shows the latest version, and continuing to use the app means you accept the update. Questions or reports: open an issue at{" "}
          <a href="https://github.com/dsameendra/nexus-lounge/issues">github.com/dsameendra/nexus-lounge</a>.
        </p>
      </section>
    </LegalPage>
  );
}
