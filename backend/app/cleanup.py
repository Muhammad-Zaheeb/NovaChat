"""Admin command: python -m app.cleanup  (needs shell access and the app's environment)."""
import asyncio

from app.database.engine import engine
from app.services.cleanup import run_cleanup


async def main() -> None:
    print(await run_cleanup())
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
