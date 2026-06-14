from app.artifact_kind import infer_kind, infer_mime_type


def test_infer_common_kinds() -> None:
    assert infer_kind("notes.md") == "markdown"
    assert infer_kind("index.html") == "html"
    assert infer_kind("report.pdf") == "pdf"
    assert infer_kind("result.xml", sample=b"<testsuite tests='1'></testsuite>") == "junit"
    assert infer_kind("blob.unknown") == "binary"


def test_infer_mime_from_kind() -> None:
    assert infer_mime_type("notes.md", "markdown").startswith("text/markdown")
    assert infer_mime_type("data.json", "json").startswith("application/json")
    assert infer_mime_type("image.png", "image") == "image/png"
