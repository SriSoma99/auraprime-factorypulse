// Synthesises one WAV per demo scene, offline, and records each duration (tools/demo/narration.json).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { findRepoRoot } from "@fp/config";

const require = createRequire(import.meta.url);
const sherpa = require("sherpa-onnx-node");

const rootDir = findRepoRoot(process.cwd());
const narration = JSON.parse(fs.readFileSync(path.join(rootDir, "tools/demo/narration.json"), "utf8"));
const modelDir = process.env.FP_TTS_MODEL_DIR;
if (!modelDir || !fs.existsSync(path.join(modelDir, "model.onnx"))) {
  console.error("Set FP_TTS_MODEL_DIR to an unpacked kokoro-en-v0_19 model directory (see tools/demo/narration.json).");
  process.exit(1);
}

const tts = new sherpa.OfflineTts({
  model: {
    kokoro: {
      model: path.join(modelDir, "model.onnx"),
      voices: path.join(modelDir, "voices.bin"),
      tokens: path.join(modelDir, "tokens.txt"),
      dataDir: path.join(modelDir, "espeak-ng-data"),
    },
    numThreads: 4,
    provider: "cpu",
  },
  maxNumSentences: 1,
});

const audioDir = path.join(rootDir, narration.outDir, "audio");
fs.mkdirSync(audioDir, { recursive: true });
const durations: Record<string, number> = {};
for (const scene of narration.scenes as { id: string; text: string }[]) {
  const audio = tts.generate({ text: scene.text, sid: narration.voice.speakerId, speed: narration.voice.speed });
  sherpa.writeWave(path.join(audioDir, `${scene.id}.wav`), { samples: audio.samples, sampleRate: audio.sampleRate });
  durations[scene.id] = Math.round((audio.samples.length / audio.sampleRate) * 1000);
  console.log(`${scene.id}: ${(durations[scene.id]! / 1000).toFixed(1)} s`);
}
fs.writeFileSync(path.join(rootDir, narration.outDir, "durations.json"), JSON.stringify(durations, null, 2) + "\n");
