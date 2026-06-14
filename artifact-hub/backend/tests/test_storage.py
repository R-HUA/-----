import pytest

from app.errors import AppError
from app.storage import normalize_bundle_path


def test_normalize_bundle_path_rejects_traversal() -> None:
    with pytest.raises(AppError):
        normalize_bundle_path("../index.html")

    with pytest.raises(AppError):
        normalize_bundle_path("/index.html")

    assert normalize_bundle_path("assets/app.js") == "assets/app.js"
