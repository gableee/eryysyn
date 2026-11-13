from app.rag.chunk import chunk_pages, count_tokens

PARA_A = "Alpha beta gamma delta. " * 5
PARA_B = "Epsilon zeta eta theta. " * 5


def test_never_crosses_page_and_indexes_globally():
    pages = [(1, PARA_A.strip()), (2, PARA_B.strip())]
    chunks = chunk_pages(pages, max_tokens=250)
    assert [c.page for c in chunks] == [1, 2]
    assert [c.chunk_index for c in chunks] == [0, 1]


def test_packs_small_paragraphs_together():
    text = "First paragraph here.\n\nSecond paragraph here."
    chunks = chunk_pages([(1, text)], max_tokens=250)
    assert len(chunks) == 1
    assert "\n\n" in chunks[0].text


def test_heading_stays_with_next_paragraph():
    body = "word " * 30
    text = f"{body.strip()}.\n\nResponsibilities to Employers\n\n{body.strip()}."
    # max_tokens fits one body paragraph + heading but not two bodies
    limit = count_tokens(f"Responsibilities to Employers\n\n{body.strip()}.") + 1
    chunks = chunk_pages([(1, text)], max_tokens=limit)
    assert len(chunks) == 2
    assert chunks[1].text.startswith("Responsibilities to Employers")


def test_long_paragraph_split_by_sentence_within_limit():
    text = " ".join(f"Sentence number {i} is here." for i in range(40))
    chunks = chunk_pages([(1, text)], max_tokens=50)
    assert len(chunks) > 1
    assert all(count_tokens(c.text) <= 50 for c in chunks)
    assert all(c.page == 1 for c in chunks)


def test_no_empty_chunks_and_oversized_word_is_kept_with_warning(caplog):
    giant = "1234567890" * 9  # one unbroken string, far over the limit
    assert count_tokens(giant) > 8
    with caplog.at_level("WARNING"):
        chunks = chunk_pages([(1, f"Hello there. {giant}")], max_tokens=8)
    assert all(c.text.strip() for c in chunks)           # no empty chunk (the bug)
    assert any(c.text == giant for c in chunks)          # the giant string is kept whole
    assert "Unsplittable" in caplog.text                 # and it is not silent


def test_empty_and_whitespace_pages_give_no_chunks():
    assert chunk_pages([(1, ""), (2, "   \n\n  ")]) == []
