import { ChapterData, SearchResult, Book, FavoriteVerseRef, ResolvedFavorite, BibleVerse, SearchParams, VerseHighlight, ResolvedHighlight } from '../src/types';

// A simple in-memory cache for fetched BOOK data
const bookCache: Record<string, any> = {};

// Helper to generate the path for a book's JSON file
const getBookPath = (bookName: string): string => {
    const sanitizedBookName = bookName.replace(/\s/g, '');
    return `/data/json/${sanitizedBookName}.json`;
};

// Fetches a full book if not in cache
const getBookData = async (bookName: string): Promise<any | null> => {
    if (bookCache[bookName]) {
        return bookCache[bookName];
    }
    const bookPath = getBookPath(bookName);
    try {
        const response = await fetch(bookPath);
        if (!response.ok) {
            console.error(`Network response was not ok for ${bookPath}`);
            return null;
        }
        const bookData = await response.json();
        if (bookData.chapters && bookData.chapters.length > 0) {
            bookCache[bookName] = bookData;
        }
        return bookData;
    } catch (error) {
        console.error(`Failed to fetch book data for ${bookName}:`, error);
        return null;
    }
}

export const getChapter = async (bookName: string, chapter: number): Promise<ChapterData | null> => {
    try {
        const bookData = await getBookData(bookName);
        if (!bookData || !bookData.chapters || !Array.isArray(bookData.chapters)) {
             console.warn(`No chapter data found for ${bookName}. The book file might be empty or missing.`);
             return null;
        }

        // Find the specific chapter
        const chapterData = bookData.chapters.find((ch: any) => parseInt(ch.chapter) === chapter);
        if (!chapterData || !chapterData.verses) {
            console.warn(`No chapter ${chapter} found for ${bookName}.`);
            return null;
        }

        // Convert the verses array to BibleVerse format
        const verses: BibleVerse[] = chapterData.verses.map((verse: any) => ({
            book_name: bookName,
            chapter: chapter,
            verse: parseInt(verse.verse, 10),
            text: verse.text,
        }));

        if (verses.length === 0) {
             console.warn(`No verses found for ${bookName} ${chapter}. The file might be empty or invalid.`);
        }

        const chapterResult: ChapterData = {
            reference: `${bookName} ${chapter}`,
            verses: verses
        };
        
        return chapterResult;
    } catch (error) {
        console.error(`Failed to get chapter data for ${bookName} ${chapter}:`, error);
        return null;
    }
};

export const search = async (params: SearchParams, bibleBooks: Book[]): Promise<SearchResult[]> => {
    const results: SearchResult[] = [];
    const { query, testament, book: bookName, chapter } = params;

    if (!query.trim()) return results;
    
    const queryLower = query.toLowerCase();
    const queryRegex = new RegExp(`(${query.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');

    let booksToSearch: Book[] = [];
    if (bookName !== 'any') {
        const bookMeta = bibleBooks.find(b => b.name === bookName);
        if (bookMeta) booksToSearch.push(bookMeta);
    } else if (testament !== 'any') {
        booksToSearch = bibleBooks.filter(b => b.testament === testament);
    } else {
        booksToSearch = bibleBooks;
    }

    const chapterToSearch = chapter.trim() ? parseInt(chapter, 10) : null;
    if (chapter.trim() && isNaN(chapterToSearch || 0)) {
        return []; // Invalid chapter number
    }
    
    for (const book of booksToSearch) {
        const bookData = await getBookData(book.name);
        if (!bookData || !bookData.chapters || !Array.isArray(bookData.chapters)) continue;

        // Filter chapters based on search criteria
        const chaptersToScan = chapterToSearch 
            ? bookData.chapters.filter((ch: any) => parseInt(ch.chapter) === chapterToSearch)
            : bookData.chapters;
        
        for (const chapterData of chaptersToScan) {
            if (!chapterData.verses || !Array.isArray(chapterData.verses)) continue;

            for (const verse of chapterData.verses) {
                 if (verse.text && verse.text.toLowerCase().includes(queryLower)) {
                     results.push({
                        reference: `${book.name} ${chapterData.chapter}:${verse.verse}`,
                        book: book,
                        chapter: parseInt(chapterData.chapter, 10),
                        verse: parseInt(verse.verse, 10),
                        text: verse.text.replace(queryRegex, `<strong class="bg-[var(--color-accent-bg)] text-[var(--color-accent)] font-bold">$1</strong>`),
                     });
                 }
            }
        }
    }

    return results;
};

export const resolveFavorites = async (refs: FavoriteVerseRef[]): Promise<ResolvedFavorite[]> => {
    const resolvedFavorites: ResolvedFavorite[] = [];
    if (!refs || refs.length === 0) return [];
    
    // Group refs by book to fetch each book only once
    const refsByBook: Record<string, FavoriteVerseRef[]> = {};
    for (const ref of refs) {
        try {
            const [_translation, bookName] = ref.split(':');
            if (!refsByBook[bookName]) {
                refsByBook[bookName] = [];
            }
            refsByBook[bookName].push(ref);
        } catch(e) {
            console.error('Could not parse favorite ref:', ref);
        }
    }

    for (const bookName in refsByBook) {
        const bookData = await getBookData(bookName);
        if (!bookData || !bookData.chapters || !Array.isArray(bookData.chapters)) continue;

        for (const ref of refsByBook[bookName]) {
            const [_translation, _bookName, chapterNumStr, verseNumStr] = ref.split(':');
            const chapterNum = parseInt(chapterNumStr, 10);
            const verseNum = parseInt(verseNumStr, 10);
            
            // Find the chapter
            const chapterData = bookData.chapters.find((ch: any) => parseInt(ch.chapter) === chapterNum);
            if (chapterData && chapterData.verses) {
                // Find the verse
                const verse = chapterData.verses.find((v: any) => parseInt(v.verse) === verseNum);
                if (verse && verse.text) {
                    resolvedFavorites.push({
                        ref,
                        bookName,
                        chapter: chapterNum,
                        verse: verseNum,
                        reference: `${bookName} ${chapterNumStr}:${verseNumStr}`,
                        text: verse.text
                    });
                }
            }
        }
    }

    // Preserve original favorite order
    return refs.map(ref => resolvedFavorites.find(fav => fav.ref === ref)).filter(Boolean) as ResolvedFavorite[];
};

export const resolveHighlights = async (highlights: VerseHighlight[]): Promise<ResolvedHighlight[]> => {
    const resolvedHighlights: ResolvedHighlight[] = [];
    if (!highlights || highlights.length === 0) return [];

    // Group refs by book to fetch each book only once
    const refsByBook: Record<string, VerseHighlight[]> = {};
    for (const highlight of highlights) {
        try {
            const [, bookName] = highlight.ref.split(':');
            if (!refsByBook[bookName]) {
                refsByBook[bookName] = [];
            }
            refsByBook[bookName].push(highlight);
        } catch (e) {
            console.error('Could not parse highlight ref:', highlight.ref);
        }
    }

    for (const bookName in refsByBook) {
        const bookData = await getBookData(bookName);
        if (!bookData || !bookData.chapters || !Array.isArray(bookData.chapters)) continue;

        for (const highlight of refsByBook[bookName]) {
            const [, , chapterNumStr, verseNumStr] = highlight.ref.split(':');
            const chapterNum = parseInt(chapterNumStr, 10);
            const verseNum = parseInt(verseNumStr, 10);
            
            // Find the chapter
            const chapterData = bookData.chapters.find((ch: any) => parseInt(ch.chapter) === chapterNum);
            if (chapterData && chapterData.verses) {
                // Find the verse
                const verse = chapterData.verses.find((v: any) => parseInt(v.verse) === verseNum);
                if (verse && verse.text) {
                    resolvedHighlights.push({
                        ...highlight,
                        bookName,
                        chapter: chapterNum,
                        verse: verseNum,
                        reference: `${bookName} ${chapterNumStr}:${verseNumStr}`,
                        text: verse.text
                    });
                }
            }
        }
    }

    // Preserve original highlight order
    return highlights.map(h => resolvedHighlights.find(rh => rh.ref === h.ref)).filter(Boolean) as ResolvedHighlight[];
};