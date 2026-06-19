/**
 * Bash guard — destructive-command detector (M3-6).
 *
 * Detects shell commands that could cause irreversible damage (file wipes,
 * filesystem re-formats, permission resets, etc.) before they are executed
 * by a Fighter.  Pure function — no side effects.
 *
 * Enforcement is additive: when isDestructiveCommand returns true, the caller
 * must abort and escalate rather than run the command.
 */

/**
 * Hardcoded regex of destructive command prefixes.
 * Anchored at the start of the (trimmed) command string so that e.g.
 * "echo rm -rf" is not flagged, but "rm -rf /tmp/foo" is.
 */
const DESTRUCTIVE_PATTERNS: RegExp[] = [
  /^rm\s+-[^\s]*r/i,          // rm -rf, rm -r, rm -Rf, etc.
  /^mkfs\b/i,                  // mkfs.ext4, mkfs.vfat, ...
  /^dd\b/i,                    // dd -- raw disk writes
  /^chmod\s+-[^\s]*R/,         // chmod -R (recursive permission change)
  /^chown\s+-[^\s]*R/,         // chown -R (recursive ownership change)
  /^shred\b/i,                 // shred -- secure-erase files
  /^wipefs\b/i,                // wipefs -- wipe filesystem signatures
  /^fdisk\b/i,                 // fdisk -- partition table editor
  /^parted\b/i,                // parted -- partition tool
  /^mkswap\b/i,                // mkswap -- overwrite swap device
];

/**
 * Returns true if the command matches one of the hardcoded destructive
 * prefixes, false otherwise.
 *
 * @param command - The raw shell command string to inspect.
 */
export function isDestructiveCommand(command: string): boolean {
  const trimmed = command.trimStart();
  return DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(trimmed));
}
