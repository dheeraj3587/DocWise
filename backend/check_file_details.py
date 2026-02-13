import asyncio
from models.database import async_session
from models.file import File
from sqlalchemy import select, desc

async def check():
    async with async_session() as s:
        result = await s.execute(
            select(File).order_by(desc(File.created_at)).limit(3)
        )
        files = result.scalars().all()
        print(f'Last 3 files with details:')
        for f in files:
            print(f'\nFile: {f.file_name}')
            print(f'  ID: {f.file_id}')
            print(f'  Status: {f.status}')
            print(f'  Type: {f.file_type}')
            print(f'  Created by: {f.created_by}')
            print(f'  Created at: {f.created_at}')

asyncio.run(check())
