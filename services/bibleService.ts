
import { ChapterData, SearchResult, Book, FavoriteVerseRef, ResolvedFavorite, BibleVerse, Translation, SearchParams, VerseHighlight, ResolvedHighlight } from '../types';

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
        if (Object.keys(bookData.chapters).length > 0) {
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
        if (!bookData || !bookData.chapters || !bookData.chapters[chapter]) {
             console.warn(`No chapter data found for ${bookName} ${chapter}. The book file might be empty or missing the chapter.`);
             return null;
        }

        const verseData: Record<string, string> = bookData.chapters[chapter];
        const verses: BibleVerse[] = Object.entries(verseData).map(([verseNum, text]) => ({
            book_name: bookName,
            chapter: chapter,
            verse: parseInt(verseNum, 10),
            text: text,
        }));

        if (verses.length === 0) {
             console.warn(`No verses found for ${bookName} ${chapter}. The file might be empty or invalid.`);
        }

        const chapterData: ChapterData = {
            reference: `${bookName} ${chapter}`,
            verses: verses
        };
        
        return chapterData;
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
        if (!bookData || !bookData.chapters) continue;

        const chaptersToScan = chapterToSearch ? [String(chapterToSearch)] : Object.keys(bookData.chapters);
        
        for (const chapNum of chaptersToScan) {
            const chapterData = bookData.chapters[chapNum];
            if (!chapterData) continue;

            for (const verseNum in chapterData) {
                 const verseText = chapterData[verseNum];
                 if (verseText.toLowerCase().includes(queryLower)) {
                     results.push({
                        reference: `${book.name} ${chapNum}:${verseNum}`,
                        book: book,
                        chapter: parseInt(chapNum, 10),
                        verse: parseInt(verseNum, 10),
                        text: verseText.replace(queryRegex, `<strong class="bg-[var(--color-accent-bg)] text-[var(--color-accent)] font-bold">$1</strong>`),
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
        if (!bookData || !bookData.chapters) continue;

        for (const ref of refsByBook[bookName]) {
            const [_translation, _bookName, chapterNumStr, verseNumStr] = ref.split(':');
            const chapter = bookData.chapters[chapterNumStr];
            if(chapter) {
                const verseText = chapter[verseNumStr];
                if (verseText) {
                    resolvedFavorites.push({
                        ref,
                        bookName,
                        chapter: parseInt(chapterNumStr, 10),
                        reference: `${bookName} ${chapterNumStr}:${verseNumStr}`,
                        text: verseText
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
        if (!bookData || !bookData.chapters) continue;

        for (const highlight of refsByBook[bookName]) {
            const [, , chapterNumStr, verseNumStr] = highlight.ref.split(':');
            const chapter = bookData.chapters[chapterNumStr];
            if (chapter) {
                const verseText = chapter[verseNumStr];
                if (verseText) {
                    resolvedHighlights.push({
                        ...highlight,
                        bookName,
                        chapter: parseInt(chapterNumStr, 10),
                        reference: `${bookName} ${chapterNumStr}:${verseNumStr}`,
                        text: verseText
                    });
                }
            }
        }
    }

    // Preserve original highlight order
    return highlights.map(h => resolvedHighlights.find(rh => rh.ref === h.ref)).filter(Boolean) as ResolvedHighlight[];
};