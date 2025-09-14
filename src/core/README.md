# 🧩 MCX: Memory Context Exchange Protocol

> *The decentralized nervous system for AI memory.*  
> Interoperable, persistent, user-owned, and portable — MCX is the TCP/IP of AI memory.

---

# 🌍 Purpose & Vision

AI agents today are isolated, each with their own memory silo.  
*MCX* solves this by providing:

- *Interoperability:* One memory format for all AI agents.
- *Persistence:* Conversations and context survive refreshes and migrations.
- *Ownership:* Users own their data cryptographically.
- *Portability:* Memory moves seamlessly between web, VSCode, mobile, and more.

> Think of MCX as the underlying standard for AI memory, just like TCP/IP for the internet.

---

# 🛠 Technical Principles

1. *Decoupling*
   - Agents never touch Firestore/IPFS directly.
   - All interactions go through MCX, which handles serialization, storage, and encryption.

2. *Standardization*
   - Every memory slice is serialized as .mtp_context.json.
   - Fields: uuid, agent_id, session_id, timestamp, content_hash, signature.

3. *Verifiability*
   - Each slice has a content hash, stored on Avalanche.
   - Users and agents can verify memory integrity.

4. *Encryption First*
   - Content is encrypted client-side.
   - Lit Protocol (or Proxy Re-Encryption) ensures only the owner’s wallet can decrypt.

---

# 🔄 Lifecycle Flow

Every memory slice follows this lifecycle:

1. *Initialize Session*
   - User logs in via Clerk → gets UUID from Firestore.
   - MCX binds session to UUID.

2. *Check Context File*
   - Agent asks: “Is there prior memory for this UUID/session?”
   - MCX checks .mtp_context.json reference in Firestore.

3. *Fetch Context*
   - If prior memory exists, fetch slices from IPFS using CIDs.

4. *Append Slice*
   - New conversation or agent output is appended as a new slice.

5. *Recommit + Hash*
   - MCX generates CID (content identifier).
   - CID + UUID + metadata pushed to Firestore + Avalanche.

6. *Update Vault*
   - Vault is current; any future agent can pick it up.

---

# 📦 Data Structures

**Example MCX Slice (.mtp_context.json):**

json
{
  "uuid": "1ce60864-f5eb-4f37-bce8-207d721c2eed",
  "agent_id": "copilot",
  "session_id": "2025-09-14-123456",
  "timestamp": "2025-09-14T12:34:56Z",
  "content": {
    "input": "Refactor this function",
    "output": "Here’s an optimized version..."
  },
  "content_hash": "QmT7sz3...CID",
  "signature": "0xa93b...sig"
}


- *Portability:* Any MCX-aware agent can consume.
- *Security:* Signature ensures provenance.
- *Traceability:* Hash guarantees immutability.

---

# 🛡 Security Model

- *Clerk:* Manages user identity.
- *UUID:* Permanent identifier across sessions.
- *Avalanche:* Logs content hash + metadata for auditability.
- *Lit Protocol:* Key re-encryption; only user’s wallet can decrypt slices.
- *Firestore:* Indexes where things are (UUID → CIDs).

> Security triangulated: *Auth (Clerk) + Persistence (Firestore/IPFS) + Ownership (Avalanche)*

---

# ⚙ Integration in De-MAPP

- *Landing Page:* Explore Protocol → Clerk → UUID created.
- *Dashboard:* Queries MCX to fetch all slices linked to UUID.
- *Plugins (VS Code, Cursor, etc.):*  
  Use mcx.push() or mcx.pull() for memory operations — no custom storage needed.

---

# 🚀 Benefits

- *For Users:* Memory travels with them, not locked in apps.
- *For Developers:* One SDK (MCX) for persistence, not custom solutions.
- *For Enterprises:* Unified memory layer across departments & tools.
- *For Ecosystem:* MCX can evolve into a standard protocol (like REST/GraphQL for memory).

---

# 🆚 Comparison Table

| Feature            | MCX Protocol | Proprietary AI Memory | Local Storage | Cloud Sync | Web3 Storage |
|--------------------|:------------:|:---------------------:|:-------------:|:----------:|:------------:|
| Interoperable      | ✅           | ❌                    | ❌            | ❌         | ❌           |
| Persistent         | ✅           | Limited               | Limited       | Limited    | ✅           |
| User-Owned         | ✅           | ❌                    | Limited       | ❌         | ✅           |
| Portable           | ✅           | ❌                    | ❌            | Limited    | ✅           |
| Verifiable         | ✅           | ❌                    | ❌            | ❌         | ✅           |
| Encrypted          | ✅           | Limited               | Limited       | Limited    | ✅           |

---

# 📦 Example Usage

js
// Pseudocode for MCX SDK
const session = await mcx.initSession({ uuid });
const context = await mcx.pull({ uuid, session_id });
await mcx.push({ uuid, session_id, content });


---

# 🛣 Roadmap

- ✅ Protocol design & serialization
- ✅ Avalanche hash logging
- ✅ Firestore integration
- 🚧 Lit Protocol encryption
- 🚧 SDKs for JS, Python, Rust
- 🔜 Plugin integrations (VS Code, Chrome, etc.)
- 🔜 Community standardization

---

# 💡 In Summary

MCX is the decentralized nervous system of De-MAPP —  
Every thought (slice) is encoded, secured, exchanged, and reused without silos.

---

# 📬 Contact & Contribution

- [GitHub Issues](https://github.com/Priyank911/DEmapp/issues)
- PRs and feedback welcome!

---

<p align="center"><b>MCX: The protocol for persistent, portable, and user-owned AI memory.</b></p>
```