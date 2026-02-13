import asyncio
from models.database import async_session
from models.file import File
from sqlalchemy import select

async def check():
    async with async_session() as s:
        result = await s.execute(select(File).where(File.status == 'processing'))
        files = result.scalars().all()
        print(f'Found {len(files)} files in processing state:')
        for f in files:
            print(f'  - {f.file_id}: {f.file_name}')
        
        # Also reset them to failed so user can retry
        if files:
            for f in files:
                f.status = 'failed'
            await s.commit()
            print('\nReset all to "failed" status for retry.')

asyncio.run(check())
