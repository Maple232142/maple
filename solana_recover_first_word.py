#!/usr/bin/env python3
"""
Khoi phuc vi Solana CUA BAN khi quen TU DAU TIEN trong seed phrase 24 tu.

Ban cung cap:
  - 23 tu con lai (tu thu 2 -> tu thu 24), dung thu tu
  - Dia chi vi Solana (public key) cua ban de doi chieu

Script thu 2048 tu BIP39 cho vi tri thu 1, loc theo checksum, roi derive
dia chi theo cac derivation path pho bien va so voi dia chi cua ban.
Chay hoan toan offline, khong gui gi len mang.

Cai dat:  pip install mnemonic cryptography
Chay:     python3 solana_recover_first_word.py
"""
import hashlib
import hmac
import getpass
import sys

from mnemonic import Mnemonic
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization

B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
HARDENED = 0x80000000

# Path pho bien: Phantom/Solflare/Backpack, Trust/Ledger cu, Solana CLI
PATHS = {
    "m/44'/501'/0'/0' (Phantom, Solflare)": [44, 501, 0, 0],
    "m/44'/501'/0'": [44, 501, 0],
    "m/44'/501'": [44, 501],
}


def b58encode(data: bytes) -> str:
    n = int.from_bytes(data, "big")
    out = ""
    while n:
        n, r = divmod(n, 58)
        out = B58[r] + out
    pad = len(data) - len(data.lstrip(b"\0"))
    return "1" * pad + out


def slip10_ed25519(seed: bytes, path: list[int]) -> bytes:
    digest = hmac.new(b"ed25519 seed", seed, hashlib.sha512).digest()
    key, chain = digest[:32], digest[32:]
    for idx in path:
        data = b"\0" + key + (idx | HARDENED).to_bytes(4, "big")
        digest = hmac.new(chain, data, hashlib.sha512).digest()
        key, chain = digest[:32], digest[32:]
    return key


def pubkey_address(priv: bytes) -> str:
    pub = Ed25519PrivateKey.from_private_bytes(priv).public_key().public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw
    )
    return b58encode(pub)


def address_from_mnemonic(phrase: str, path: list[int], passphrase: str = "") -> str:
    seed = Mnemonic.to_seed(phrase, passphrase)
    return pubkey_address(slip10_ed25519(seed, path))


def recover(rest_words: list[str], target: str, passphrase: str = ""):
    m = Mnemonic("english")
    candidates = [w for w in m.wordlist if m.check(" ".join([w] + rest_words))]
    print(f"[i] {len(candidates)}/2048 tu qua duoc checksum, dang derive dia chi...")
    for w in candidates:
        phrase = " ".join([w] + rest_words)
        seed = Mnemonic.to_seed(phrase, passphrase)
        for name, path in PATHS.items():
            if pubkey_address(slip10_ed25519(seed, path)) == target:
                return w, name
    return None, None


def main():
    m = Mnemonic("english")
    raw = getpass.getpass("Nhap 23 tu (tu thu 2 -> 24), cach nhau boi dau cach (an khi go): ")
    rest = raw.strip().lower().split()
    if len(rest) != 23:
        sys.exit(f"[!] Can dung 23 tu, ban nhap {len(rest)} tu.")
    bad = [w for w in rest if w not in m.wordlist]
    if bad:
        sys.exit(f"[!] Tu khong co trong danh sach BIP39: {bad}")
    target = input("Dia chi vi Solana cua ban: ").strip()
    passphrase = getpass.getpass("Passphrase BIP39 (Enter neu khong co): ")

    word, path = recover(rest, target, passphrase)
    if word:
        print(f"[+] TIM THAY! Tu dau tien la: '{word}'  (path {path})")
    else:
        print("[-] Khong tim thay. Kiem tra lai thu tu 23 tu, dia chi vi, passphrase,")
        print("    hoac co the tu bi sai khong nam o vi tri dau tien.")


if __name__ == "__main__":
    main()
