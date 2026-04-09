import pytest
from detection_service.db.pool import get_pool, close_pool
from detection_service.db.prompts_repo import PromptsRepo


@pytest.fixture
async def pool():
    p = await get_pool()
    yield p
    await close_pool()


async def test_get_active_prompt_returns_seeded_gatekeeper(pool):
    repo = PromptsRepo(pool)
    body, version = await repo.get_active("gatekeeper_interior")
    assert version == 1
    assert "home interior" in body.lower()


async def test_get_active_prompt_unknown_raises(pool):
    repo = PromptsRepo(pool)
    with pytest.raises(LookupError):
        await repo.get_active("nonexistent_prompt")
