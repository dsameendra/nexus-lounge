import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy · Nexus Lounge" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="25 October 2026">
      <p>Nexus Lounge keeps as little about you as it can. There is no user database: this page explains exactly what is processed and for how long.</p>

      <section>
        <h2>What we receive</h2>
        <ul>
          <li>
            <strong className="text-white">Discord sign-in:</strong> your Discord user ID, username and avatar (the &ldquo;identify&rdquo; information). We don&apos;t receive your email, password or servers.
          </li>
          <li>
            <strong className="text-white">Guest sign-in:</strong> only the display name you type.
          </li>
          <li>
            <strong className="text-white">Your profile edits:</strong> the display name and avatar you choose on the account page.
          </li>
        </ul>
      </section>

      <section>
        <h2>Where it is kept</h2>
        <ul>
          <li>Your sign-in lives in an encrypted session cookie in your browser. It isn&apos;t stored in a database.</li>
          <li>Rooms are kept in the server&apos;s memory only: members, chat messages, the stream list and queue, and moderation state. They are removed when the room ends and when the service restarts.</li>
          <li>Voice and screen shares are relayed live through LiveKit and are not recorded.</li>
          <li>Preferences such as volume, captions, fit or fill and your TV output choice are saved in your browser&apos;s local storage and never sent to us.</li>
        </ul>
      </section>

      <section>
        <h2>Third parties</h2>
        <ul>
          <li>Discord handles sign-in under its own privacy policy.</li>
          <li>YouTube and Twitch players are embedded and may set their own cookies and collect data under their policies.</li>
          <li>The app is hosted on Railway, and voice and screen sharing run through LiveKit.</li>
          <li>We don&apos;t run analytics or advertising and don&apos;t sell data.</li>
        </ul>
      </section>

      <section>
        <h2>Your choices</h2>
        <ul>
          <li>Change your display name and avatar, or sign out, from the account page.</li>
          <li>
            Delete your account from the account page (while you&apos;re not in a room). This signs you out and removes your profile and your membership records from rooms. Because there is no database, there is nothing else to erase; signing in again with Discord simply starts fresh.
          </li>
          <li>You can also remove the app&apos;s access from Discord under User Settings, Authorized Apps.</li>
        </ul>
      </section>

      <section>
        <h2>Children</h2>
        <p>The app isn&apos;t directed at children under 13, and you must meet Discord&apos;s minimum age to sign in with it.</p>
      </section>

      <section>
        <h2>Changes and contact</h2>
        <p>
          We&apos;ll update the date above when this policy changes. Questions or requests: open an issue at{" "}
          <a href="https://github.com/dsameendra/nexus-lounge/issues">github.com/dsameendra/nexus-lounge</a>.
        </p>
      </section>
    </LegalPage>
  );
}
