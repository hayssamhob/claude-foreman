import { describe, it, expect } from "vitest";
import { isDestructiveCommand } from "../../src/guard/bash.js";

describe("isDestructiveCommand", () => {
  // --- destructive commands that MUST be flagged ---

  it("flags rm -rf", () => {
    expect(isDestructiveCommand("rm -rf /tmp/foo")).toBe(true);
  });

  it("flags rm -Rf", () => {
    expect(isDestructiveCommand("rm -Rf /home/user")).toBe(true);
  });

  it("flags rm -r (without f)", () => {
    expect(isDestructiveCommand("rm -r /var/log")).toBe(true);
  });

  it("flags mkfs.ext4", () => {
    expect(isDestructiveCommand("mkfs.ext4 /dev/sdb1")).toBe(true);
  });

  it("flags mkfs (bare)", () => {
    expect(isDestructiveCommand("mkfs /dev/sda")).toBe(true);
  });

  it("flags dd", () => {
    expect(isDestructiveCommand("dd if=/dev/zero of=/dev/sda bs=4M")).toBe(true);
  });

  it("flags chmod -R 777", () => {
    expect(isDestructiveCommand("chmod -R 777 /etc")).toBe(true);
  });

  it("flags chown -R", () => {
    expect(isDestructiveCommand("chown -R root:root /")).toBe(true);
  });

  it("flags shred", () => {
    expect(isDestructiveCommand("shred -u secrets.txt")).toBe(true);
  });

  it("flags wipefs", () => {
    expect(isDestructiveCommand("wipefs -a /dev/sdb")).toBe(true);
  });

  it("flags fdisk", () => {
    expect(isDestructiveCommand("fdisk /dev/sda")).toBe(true);
  });

  it("flags parted", () => {
    expect(isDestructiveCommand("parted /dev/sda mklabel gpt")).toBe(true);
  });

  it("flags mkswap", () => {
    expect(isDestructiveCommand("mkswap /dev/sda2")).toBe(true);
  });

  it("flags commands with leading whitespace", () => {
    expect(isDestructiveCommand("  rm -rf /tmp")).toBe(true);
  });

  // --- safe commands that MUST NOT be flagged ---

  it("does not flag ls", () => {
    expect(isDestructiveCommand("ls -la")).toBe(false);
  });

  it("does not flag echo", () => {
    expect(isDestructiveCommand("echo rm -rf")).toBe(false);
  });

  it("does not flag git commands", () => {
    expect(isDestructiveCommand("git status")).toBe(false);
  });

  it("does not flag npm install", () => {
    expect(isDestructiveCommand("npm install")).toBe(false);
  });

  it("does not flag chmod without -R", () => {
    expect(isDestructiveCommand("chmod 644 file.txt")).toBe(false);
  });

  it("does not flag chown without -R", () => {
    expect(isDestructiveCommand("chown user:group file.txt")).toBe(false);
  });

  it("does not flag rm without recursive flag", () => {
    expect(isDestructiveCommand("rm file.txt")).toBe(false);
  });

  it("does not flag an empty string", () => {
    expect(isDestructiveCommand("")).toBe(false);
  });
});
