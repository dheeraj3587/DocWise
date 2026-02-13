import asyncio
from models.database import async_session
from models.file import File
from sqlalchemy import select, desc

async def check():
    async with async_session() as s:
        result = await s.execute(
            select(File).order_by(desc(File.created_at)).limit(5)
        )
        files = result.scalars().all()
        print(f'Last 5 files:')
        for f in files:
            print(f'  {f.file_name}: {f.status} (created {f.created_at})')

asyncio.run(check())
