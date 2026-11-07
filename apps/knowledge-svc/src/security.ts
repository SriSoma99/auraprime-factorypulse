// Prompt injection and document security scanner (RAG-10).
// Scans documents prior to vector embedding to prevent indirect prompt injection attacks.

export interface InjectionScanResult {
  safe: boolean;
  threats: string[];
}

const INJECTION_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: "instruction_override", regex: /ignore\s+(all\s+)?(previous|prior)\s+(instructions|directions|prompts)/i },
  { name: "system_prompt_leak", regex: /(system\s+prompt|reveal\s+prompt|show\s+hidden\s+rules)/i },
  { name: "roleplay_jailbreak", regex: /(you\s+are\s+now\s+in\s+developer\s+mode|dan\s+mode|jailbroken)/i },
  { name: "script_tag", regex: /<script[\s>]/i },
  { name: "javascript_uri", regex: /javascript\s*:/i },
  { name: "command_injection", regex: /(^|;|\&\&|\|)\s*(rm\s+-rf|del\s+\/f|format\s+c:)/i },
  { name: "sql_drop_destructive", regex: /(drop\s+table|truncate\s+table|delete\s+from\s+(plat|tel|intel|know|case|gov)\.)/i },
];

export function scanDocumentSecurity(content: string): InjectionScanResult {
  const threats: string[] = [];

  for (const { name, regex } of INJECTION_PATTERNS) {
    if (regex.test(content)) {
      threats.push(name);
    }
  }

  return {
    safe: threats.length === 0,
    threats,
  };
}
