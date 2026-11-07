// Places each narration clip at its scene start and muxes it with the recorded video into an MP4 (tools/demo/narration.json).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { findRepoRoot } from "@fp/config";

// The ffmpeg binary is machine-specific, so it comes from the environment rather than the repo.
const ffmpeg = process.env.FP_FFMPEG_PATH;
if (!ffmpeg || !fs.existsSync(ffmpeg)) {
  console.error("Set FP_FFMPEG_PATH to an ffmpeg executable built with libx264 and aac.");
  process.exit(1);
}

const rootDir = findRepoRoot(process.cwd());
const narration = JSON.parse(fs.readFileSync(path.join(rootDir, "tools/demo/narration.json"), "utf8"));
const outDir = path.join(rootDir, narration.outDir);
const timeline: { video: string; scenes: { id: string; startMs: number }[] } = JSON.parse(
  fs.readFileSync(path.join(outDir, "timeline.json"), "utf8"),
);

// Drop idle time before the first scene (a cold dev-server bundle can take tens of seconds), keeping the configured lead-in.
const trimMs = Math.max(0, timeline.scenes[0]!.startMs - narration.leadInMs);
const inputs = ["-ss", (trimMs / 1000).toFixed(3), "-i", timeline.video];
const filters: string[] = [];
timeline.scenes.forEach((s, i) => {
  const at = s.startMs - trimMs;
  inputs.push("-i", path.join(outDir, "audio", `${s.id}.wav`));
  filters.push(`[${i + 1}:a]adelay=${at}|${at},aresample=48000[a${i}]`);
});
const mix = timeline.scenes.map((_, i) => `[a${i}]`).join("");
filters.push(`${mix}amix=inputs=${timeline.scenes.length}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[aout]`);

const out = path.join(outDir, "auraprime-factorypulse-demo.mp4");
execFileSync(ffmpeg, [
  "-y", ...inputs,
  "-filter_complex", filters.join(";"),
  "-map", "0:v", "-map", "[aout]",
  "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-shortest",
  out,
], { stdio: ["ignore", "ignore", "inherit"] });
console.log(`wrote ${out}`);
