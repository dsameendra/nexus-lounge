import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy · Nexus Lounge" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="26 October 2026">
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
          <li>
            The operator can see, live, which rooms exist and who is in them (display name, whether signed in with Discord, room name and whether it has a password). The operator cannot see chat messages, passwords or voice. The operator can also close a room or remove a person from it. This view is not stored. The server's logs record only that an admin looked, with a shortened IP address, and hosting logs are kept by Railway for a limited time.
          </li>
          <li>Voice and screen shares are relayed live through LiveKit and are not recorded.</li>
          <li>
            Torrents and video links work through your own Stremio app. A magnet, its torrent hash, file name, size and length are shared with the room, so friends who have Stremio can play the same torrent themselves; trackers that point at private or local addresses are dropped. A video link you paste is never sent to us or the room: only a random id, the name, size and length are. It stays in this browser tab (session storage) so a refresh keeps working, and is gone when you close the tab. Your Stremio address and the Chrome permission to reach it stay in your browser. When friends watch through a live feed, your browser sends them the picture and sound through LiveKit, relayed like a screen share and not recorded. Subtitles are personal and never sent to the room. If you choose Find subtitles online, your browser (not our server) sends the words you type to Stremio's title catalogue (v3-cinemeta.strem.io) and the title you pick (for a series, with the season and episode numbers) to its OpenSubtitles add-on (opensubtitles-v3.strem.io). The add-on names the host of each subtitle file, which can be any https server and not only Stremio, and your browser downloads the file you choose from that host; all of these services see your IP address. Subtitles inside a video or torrent are read through your own Stremio.
          </li>
          <li>
            Video files you add from your own device are never uploaded or stored. The room sees the file&apos;s name, size and length and a short fingerprint (a hash of a few small slices) used to check that two people have the same file. If friends without the file are watching, your browser sends them a live picture and sound through LiveKit, relayed the same way as a screen share and not recorded. On Chrome and Edge the browser can remember which file you picked (a reference kept in your browser, never sent to us) so it can reopen after a refresh; you can clear these on your account page.
          </li>
          <li>Preferences such as volume, captions, fit or fill and your TV output choice are saved in your browser&apos;s local storage and never sent to us.</li>
        </ul>
      </section>

      <section>
        <h2>Third parties</h2>
        <ul>
          <li>Discord handles sign-in under its own privacy policy.</li>
          <li>YouTube, Twitch and Kick players are embedded and may set their own cookies and collect data under their policies.</li>
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
