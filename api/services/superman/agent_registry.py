"""Registry heartbeat agent Superman lokal (in-memory)."""

from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass, field
from typing import Any

HEARTBEAT_TTL_SECONDS = int(os.getenv("SUPERMAN_AGENT_TTL_SECONDS", "60"))


@dataclass
class AgentPresence:
    agent_id: str
    hostname: str = ""
    version: str = ""
    last_seen: float = field(default_factory=time.time)
    meta: dict[str, Any] = field(default_factory=dict)


_agents: dict[str, AgentPresence] = {}
_lock = threading.Lock()


def heartbeat(
    agent_id: str,
    *,
    hostname: str = "",
    version: str = "",
    meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    aid = (agent_id or "").strip()
    if not aid:
        raise ValueError("agent_id wajib")
    now = time.time()
    with _lock:
        _agents[aid] = AgentPresence(
            agent_id=aid,
            hostname=(hostname or "").strip(),
            version=(version or "").strip(),
            last_seen=now,
            meta=meta or {},
        )
        # buang yang sudah mati
        stale = [k for k, v in _agents.items() if now - v.last_seen > HEARTBEAT_TTL_SECONDS * 3]
        for k in stale:
            _agents.pop(k, None)
    return {
        "ok": True,
        "agent_id": aid,
        "ttl_seconds": HEARTBEAT_TTL_SECONDS,
        "server_time": now,
    }


def list_online_agents() -> list[dict[str, Any]]:
    now = time.time()
    with _lock:
        online = [
            {
                "agent_id": a.agent_id,
                "hostname": a.hostname,
                "version": a.version,
                "last_seen": a.last_seen,
                "age_seconds": round(now - a.last_seen, 1),
            }
            for a in _agents.values()
            if now - a.last_seen <= HEARTBEAT_TTL_SECONDS
        ]
    online.sort(key=lambda x: x["last_seen"], reverse=True)
    return online


def is_agent_online() -> bool:
    return len(list_online_agents()) > 0


def agent_status_summary() -> dict[str, Any]:
    agents = list_online_agents()
    return {
        "agent_online": len(agents) > 0,
        "agent_count": len(agents),
        "agents": agents,
        "ttl_seconds": HEARTBEAT_TTL_SECONDS,
    }
