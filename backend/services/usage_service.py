"""PostgreSQL-authoritative credit reservation and settlement."""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from models.conversation import DailyUsage, UsageLedger


class UsageService:
    async def reserve(
        self,
        db: AsyncSession,
        *,
        owner_sub: str,
        request_id: uuid.UUID,
        units: int,
        conversation_id: uuid.UUID,
        message_id: uuid.UUID,
        provider: str,
        model_id: str,
    ) -> UsageLedger:
        existing = (
            await db.execute(
                select(UsageLedger).where(
                    UsageLedger.owner_sub == owner_sub,
                    UsageLedger.request_id == request_id,
                )
            )
        ).scalar_one_or_none()
        if existing is not None:
            return existing

        today = datetime.utcnow().date()
        daily = (
            await db.execute(
                select(DailyUsage)
                .where(
                    DailyUsage.owner_sub == owner_sub,
                    DailyUsage.usage_date == today,
                    DailyUsage.category == "chat",
                )
                .with_for_update()
            )
        ).scalar_one_or_none()
        if daily is None:
            daily = DailyUsage(
                owner_sub=owner_sub,
                usage_date=today,
                category="chat",
                used_units=0,
            )
            db.add(daily)
            await db.flush()

        requested = max(1, units)
        if daily.used_units + requested > settings.LLM_DAILY_BUDGET_UNITS_PER_USER:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Daily chat credit limit reached",
            )
        daily.used_units += requested

        ledger = UsageLedger(
            owner_sub=owner_sub,
            conversation_id=conversation_id,
            message_id=message_id,
            request_id=request_id,
            category="chat",
            reserved_units=requested,
            status="reserved",
            provider=provider,
            model_id=model_id,
        )
        db.add(ledger)
        await db.flush()
        return ledger

    async def settle(
        self,
        db: AsyncSession,
        *,
        request_id: uuid.UUID,
        owner_sub: str,
        provider: str,
        model_id: str,
        metadata: dict,
    ) -> None:
        ledger = (
            await db.execute(
                select(UsageLedger).where(
                    UsageLedger.owner_sub == owner_sub,
                    UsageLedger.request_id == request_id,
                )
            )
        ).scalar_one_or_none()
        if ledger is None or ledger.status == "settled":
            return
        ledger.status = "settled"
        ledger.settled_units = ledger.reserved_units
        ledger.provider = provider
        ledger.model_id = model_id
        ledger.usage_metadata = metadata

    async def refund(
        self,
        db: AsyncSession,
        *,
        request_id: uuid.UUID,
        owner_sub: str,
    ) -> None:
        ledger = (
            await db.execute(
                select(UsageLedger).where(
                    UsageLedger.owner_sub == owner_sub,
                    UsageLedger.request_id == request_id,
                )
            )
        ).scalar_one_or_none()
        if ledger is None or ledger.status == "refunded":
            return

        today = ledger.created_at.date() if ledger.created_at else datetime.utcnow().date()
        daily = (
            await db.execute(
                select(DailyUsage)
                .where(
                    DailyUsage.owner_sub == owner_sub,
                    DailyUsage.usage_date == today,
                    DailyUsage.category == ledger.category,
                )
                .with_for_update()
            )
        ).scalar_one_or_none()
        refundable = max(0, ledger.reserved_units - ledger.refunded_units)
        if daily is not None:
            daily.used_units = max(0, daily.used_units - refundable)
        ledger.refunded_units += refundable
        ledger.status = "refunded"

    async def daily_units(self, db: AsyncSession, owner_sub: str) -> int:
        daily = (
            await db.execute(
                select(DailyUsage).where(
                    DailyUsage.owner_sub == owner_sub,
                    DailyUsage.usage_date == datetime.utcnow().date(),
                    DailyUsage.category == "chat",
                )
            )
        ).scalar_one_or_none()
        return int(daily.used_units if daily else 0)


usage_service = UsageService()
