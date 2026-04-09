from __future__ import annotations
from psycopg_pool import AsyncConnectionPool


class PromptsRepo:
    def __init__(self, pool: AsyncConnectionPool):
        self.pool = pool

    async def get_active(self, prompt_name: str) -> tuple[str, int]:
        """Returns (body, version) for the active prompt with this name.

        Raises LookupError if not found.
        """
        async with self.pool.connection() as conn:
            cur = await conn.execute(
                """
                SELECT body, version
                FROM prompts_catalog
                WHERE prompt_name = %s AND status = 'active'
                ORDER BY version DESC
                LIMIT 1
                """,
                (prompt_name,),
            )
            row = await cur.fetchone()
            if row is None:
                raise LookupError(f"No active prompt: {prompt_name}")
            return row[0], row[1]
