import asyncio
from models.database import async_session
from models.file import File
from sqlalchemy import select

async def fix_files():
    async with async_session() as s:
        result = await s.execute(
            select(File).where(File.created_by == "")
        )
        files = result.scalars().all()
        
        if not files:
            print("No files with empty created_by found.")
            return
        
        print(f'Found {len(files)} files with empty created_by. Updating to anikatyonzon111@gmail.com...')
        
        for f in files:
            f.created_by = "anikatyonzon111@gmail.com"
            print(f'  Updated: {f.file_name} ({f.file_id})')
        
        await s.commit()
        print('\n✓ All files updated successfully!')

asyncio.run(fix_files())
