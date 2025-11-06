"""Development data seeding helpers."""

from __future__ import annotations

import logging
from typing import Dict, Optional

from modules.auth import hash_password
from modules.users import (
    count_users,
    create_user,
    get_user_by_email,
    update_user_profile,
)

logger = logging.getLogger(__name__)

LEGACY_ADMIN_EMAILS = {"admin@local"}
DEFAULT_ADMIN_EMAIL = "admin@local.test"
DEFAULT_ADMIN_PASSWORD = "admin"

TEST_USER_PASSWORD = "password"
TEST_USER_ACCOUNTS = {
    "admin": "user_admin@testing.com",
    "owner": "user_owner@testing.com",
    "editor": "user_editor@testing.com",
    "viewer": "user_viewer@testing.com",
}


def bootstrap_test_users() -> Dict[str, int]:
    """Ensure each role has a ready-to-use test account."""

    created: Dict[str, int] = {}
    for role, email in TEST_USER_ACCOUNTS.items():
        if get_user_by_email(email):
            continue

        user_id = create_user(
            email,
            f"{role.title()} Test User",
            hash_password(TEST_USER_PASSWORD),
            access_group="Testers",
            is_verified=True,
            role=role,
            must_change_password=False,
        )
        created[role] = user_id

    if created:
        created_summary = ", ".join(
            f"{role}:{TEST_USER_ACCOUNTS[role]}" for role in sorted(created)
        )
        logger.info("Bootstrapped test users: %s", created_summary)

    return created


def bootstrap_default_admin() -> Optional[int]:
    """Ensure a default admin user exists on first run."""

    created_admin_id: Optional[int] = None

    # Migrate any legacy admin accounts that used non-RFC compliant emails.
    for legacy_email in LEGACY_ADMIN_EMAILS:
        if legacy_email == DEFAULT_ADMIN_EMAIL:
            continue
        legacy_user = get_user_by_email(legacy_email)
        if not legacy_user:
            continue
        existing_default = get_user_by_email(DEFAULT_ADMIN_EMAIL)
        if existing_default and existing_default["id"] != legacy_user["id"]:
            logger.warning(
                "Legacy admin email %s present but %s already exists; skipping migration",
                legacy_email,
                DEFAULT_ADMIN_EMAIL,
            )
            continue
        full_name = legacy_user.get("full_name") or "System Administrator"
        update_user_profile(legacy_user["id"], full_name, DEFAULT_ADMIN_EMAIL)
        logger.info(
            "Migrated legacy admin email from %s to %s",
            legacy_email,
            DEFAULT_ADMIN_EMAIL,
        )

    if not count_users():
        password_hash = hash_password(DEFAULT_ADMIN_PASSWORD)
        created_admin_id = create_user(
            DEFAULT_ADMIN_EMAIL,
            "System Administrator",
            password_hash,
            access_group="Dev",
            is_verified=True,
            role="admin",
            must_change_password=True,
        )
        logger.info(
            "Created default admin user %s with temporary password requirement",
            DEFAULT_ADMIN_EMAIL,
        )

    bootstrap_test_users()
    return created_admin_id


__all__ = [
    "bootstrap_default_admin",
    "bootstrap_test_users",
    "DEFAULT_ADMIN_EMAIL",
    "DEFAULT_ADMIN_PASSWORD",
    "TEST_USER_ACCOUNTS",
    "TEST_USER_PASSWORD",
]
