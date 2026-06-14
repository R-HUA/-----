from app.config import Settings
from app.security import issue_view_token, new_share_token_marker, verify_view_token


def test_signed_view_token_can_be_reissued_and_rotated(tmp_path) -> None:
    settings = Settings(
        ARTIFACT_HUB_SESSION_SECRET="test-secret",
        ARTIFACT_HUB_DATA_DIR=tmp_path,
    )
    marker = new_share_token_marker(settings)
    token = issue_view_token("session-1", marker, settings)

    assert verify_view_token("session-1", marker, token, settings)
    assert not verify_view_token("session-2", marker, token, settings)

    rotated_marker = new_share_token_marker(settings)
    assert not verify_view_token("session-1", rotated_marker, token, settings)
