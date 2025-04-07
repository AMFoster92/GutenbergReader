import readline from 'node:readline/promises'
import { start } from 'node:repl';

// Gutendex URL constants
const searchURL = 'https://gutendex.com/books/';
const search = '?search=';
const ids = '?ids='
const bookTypeRegex =  /\btext\/plain\b/g;

// Gutenberg URL constants
const readURL = 'https://www.gutenberg.org/cache/epub/';

// Input keys as characters
const menuUpKey = "w";
const menuDownKey = "s";
const nextPageKey = 'd';
const prevPageKey = 'a';
const selectKey = 'e';
const quitKey = 'q';
const mainMenuKey = 'm';

// Special input keys as integers
const enterInt = 13;
const backspaceInt = 8;

// Map of main menu navigation functions
const menuNavFunc = new Map([
    [menuUpKey, moveCursorUp],
    [menuDownKey, moveCursorDown],
    [selectKey, selectMainMenu],
    [quitKey, exitReader]
]);

// Strings to show for main menu
const mainMenuStrs = ["Search by Title",                   
                        "Search by Author", 
                        "Continue Reading"];                  // Continue Reading always at bottom of menu

// number of main menu items
const mainMenuLen = mainMenuStrs.length;

// Map of continue reading menu functions
const continueNavFunc = new Map([
    [menuUpKey, moveCursorUp],
    [menuDownKey, moveCursorDown],
    [selectKey, selectContinueMenu],
    [quitKey, exitReader]
]);

// Map of search menu navigation functions
const searchNavFunc = new Map([
    [menuUpKey, moveCursorUp],
    [menuDownKey, moveCursorDown],
    [selectKey, selectSearchMenu],
    [quitKey, exitReader],
    [mainMenuKey, gotoMainMenu],
    [prevPageKey, gotoPrevPage],
    [nextPageKey, gotoNextPage]
]);

// Number of books to be displayed per search results page
const booksPerPage = 10;
const linesPerPage = 28;

// Map of book navigation functions
const bookNavFunc = new Map([
    [quitKey, exitReader],
    [mainMenuKey, gotoMainMenu],
    [prevPageKey, gotoPrevPage],
    [nextPageKey, gotoNextPage]
]);


// Map of main menu functions
const searchTypes = new Map([
    [0, 'book title'],
    [1, "author's name"]
]);

// ANSI Codes for text colors https://gist.github.com/fnky/458719343aabd01cfb17a3a4f7296797
const selectTextColor = "\x1b[31m";
const defTextColor = "\x1b[37m";
const hideCursor = "\x1b[?25l"
const showCursor = "\x1b[?25h";


// Menu option strings
const menuUpStr = "W) Cursor ↑";
const menuDownStr = "S) Cursor ↓";
const nextPageStr = 'D) Next Page';
const prevPageStr = 'A) Prev Page';
const selectStr = 'E) Select';
const mainMenuStr = 'M) Main Menu';
const quitStr = 'Q) Quit';


const inputStr = 'Enter Selection: ';

const invMenuSelectStr = 'Invalid Input. Please select an option from the menu.\n';



/***************************************
 * 
 * 
 *      Navigation Functions
 * 
 * 
 **************************************/ 

// Gets input from the user keyboard
async function getKeyPress()
{
    return new Promise(resolve =>
    {
        const rIn = process.stdin;          // short hand for readable stream, process.stdin is a tty.ReadStream
        rIn.setRawMode(true);               // raw mode removes terminal echo and read keypress without enter key
        rIn.setEncoding('utf-8');           // unicode encoding to make the input useful
        rIn.resume();                       // turn on the input stream and wait for data

        rIn.on('data', (key) => 
        {   
            rIn.setRawMode(false);          // turn off raw mode
            rIn.pause()                     // stop taking input, we've already got it
            rIn.removeAllListeners();       // so we don't get a quantity of listeners error
            resolve(key);                   // return the key
        });
    });
}

// move the cursor up the menu
// TODO: make cursor wrap to top
function moveCursorUp ({cursorPos})
{   
    if(cursorPos > 0)                       
    {
        cursorPos--;
    }

    return (a,b,c,d) => 
    {
        return [cursorPos, false, c, d];
    }
}

// move the cursor down the menu
// TODO: make the cursor wrap
function moveCursorDown({cursorPos, showMenu, curPage, data, hasRead})
{
    var maxPos = null;

    if(showMenu.name === "showMainMenu")
    {  
        if (cursorPos < mainMenuLen-1 && hasRead)
        {
            maxPos = mainMenuLen;
        }        
        else
        {
            maxPos = mainMenuLen - 1;
        } 
    }
    else if (showMenu.name === "showSearchMenu")
    {
        // Determine how many books displayed on this page
        maxPos = data.length - (curPage * booksPerPage) >= booksPerPage ? booksPerPage : data.length % booksPerPage;
    }
    else if (showMenu.name === "showContinueMenu")
    {
        maxPos = data.length;
    }

    if (cursorPos < maxPos-1)
    {
        cursorPos++;
    }

    return (a,b,c,d) =>
    { 
        return [cursorPos, false, c, d];

    };
}

function gotoNextPage({cursorPos, curPage, data, showMenu})
{
    var maxPage = null
    
    if(showMenu.name === 'showSearchMenu')
    {
        maxPage = Math.floor(data.length/booksPerPage) + (data.length % booksPerPage == 0 ? 0 : 1);
    }
    else if(showMenu.name === 'readBook')
    {
        maxPage = data.length;
    }
    else if(showMenu.name === 'showContinueMenu')
    {
        maxPage = data.length;
    }
    
    if (curPage < maxPage-1)
    {
        curPage++;
    }

    return (a,b,c,d) =>
    {
        return [0, false, c, curPage];
    }
}

function gotoPrevPage({cursorPos, curPage, data})
{
    if (curPage > 0)
    {
        curPage--;
    }

    return (a,b,c,d) =>
    {
        return [0, false, c, curPage,d];
    }
}

function gotoMainMenu ()
{
    return (a,b,c,d) => 
        {
            return [0, b, null, 0];
        };
}

function exitReader()
{
    return (a,b,c,d) => 
    {
        return [0, true, null, 0];
    };
}



/***************************************
 * 
 * 
 *      Show Menu Functions
 * 
 * 
 **************************************/ 
function showMainMenu({cursorPos, hasRead})
{
    console.clear();
    console.log(defTextColor, "Gutenberg Reader Main Menu\n");

    for(let i=0; i < mainMenuLen-1; i++)
    {   
        console.log("\n");
        if (cursorPos === i)
        {
            console.log(selectTextColor+ "> " + mainMenuStrs[i]);
        }
        else
        {
            console.log(defTextColor+ "  " + mainMenuStrs[i]);
        }

        console.log();
    }

    if(hasRead)
    {
        console.log("\n");
        if (cursorPos === mainMenuLen - 1)
        {
            console.log(selectTextColor+ "> " + mainMenuStrs[mainMenuLen - 1]);
        }
        else
        {
            console.log(defTextColor+ "  " + mainMenuStrs[mainMenuLen-1]);
        }
    }
    else
    {
        console.log('\n\n');
    }

    for(let i = 0; i < linesPerPage - (mainMenuLen*3); i++)
    {
        console.log();
    }



    console.log(defTextColor + "\n");
    console.log(menuUpStr + "\t" + menuDownStr + "\t" + selectStr + "\t" + quitStr);
}

async function showContinueMenu({cursorPos, data, prevData})
{
    var books = null;
    var bookLines = booksPerPage;
    var titleStr = "";
    var authorStr = "";
    var bookData = null;

    console.clear();
    console.log("Gutenberg Reader Continue Reading Menu\n\n")

    if(!data)
    {
        console.log("No previously read books. Go look some up!");
        console.log();
        bookLines--;
    }
    else
    {
        try
        {
            if(!prevData)
            {
                books = [];

                bookData = await getData(ids + data.join());
            }
            else if (prevData.length < data.length)
            {
                let newIDs = data.slice(0,prevData.length-1);
                bookData = await getData(ids + newIDs.join());
                books = prevData
            }
            else
            {
                books = prevData;
            }

            if(bookData && bookData.count > 0)
            {
                bookData = bookData.results;

                if(bookData.length > 0)
                {
                    for(let i = 0; i < data.length; i++)
                    {
                        for(let j = 0; j < bookData.length; j++)
                        {
                            if(bookData[j].id == data[i])
                            {
                                if(prevData)
                                {
                                    books.reverse();
                                    books.push(bookData[j])
                                    books.reverse();
                                }
                                else
                                {
                                    books.push(bookData[j]);
                                }
                            }
                        }
                    }
                }
            }
            
        }
        catch(error)
        {
            console.error("Getting book data", error);
        }
    }

    for(let i = 0; i < bookLines; i++)
    {
        if (books && i < books.length)
        {
            if(i === cursorPos)
            {
                titleStr += selectTextColor + "> ";
                authorStr += selectTextColor + "  ";
            }
            else
            {
                titleStr += defTextColor + "  ";
                authorStr += defTextColor + "  ";
            }
            
            titleStr += books[i].title;

            if(books[i].authors.length > 0)
            {
                authorStr += books[i].authors[0].name;
            }
            else
            {
                authorStr += 'N/A';
            }

            console.log(titleStr);
            console.log(authorStr);
            console.log();

            titleStr = "";
            authorStr = "";
        }
        else
        {
            console.log();
            console.log();
        }

        if(i < bookLines-1)
        {
            console.log();
        }
    }

    console.log(defTextColor + menuUpStr + "\t" + menuDownStr + "\t" + selectStr)
    console.log(mainMenuStr + "\t" + quitStr);

    return(a,b,c,d) =>
    {
        return [a,b,c,books]
    }
}

function showSearchMenu(cursorPos, pageNum, data)
{
    var titleStr = "";
    var authorStr = "";
    var index = 0;
    var maxPage = Math.floor(data.length/booksPerPage) + (data.length % booksPerPage == 0 ? 0 : 1);
    
    console.clear();
    console.log(defTextColor, `Gutenberg Reader Search Results\tPage (${pageNum+1}/${maxPage})\n\n`);

    for(let i=0; i < booksPerPage; i++)
    {

        if(i === cursorPos)
        {
            titleStr += selectTextColor + "> ";
            authorStr += selectTextColor + "  ";
        }
        else
        {
            titleStr += defTextColor + "  ";
            authorStr += defTextColor + "  ";
        }

        index = i + (booksPerPage * pageNum);

        if(index < data.length)
        {
            titleStr += data[index].title;

            if(data[index].authors.length > 0)
            {
                authorStr += data[index].authors[0].name
            }
            else
            {
                authorStr += "N/A";
            }

            console.log(titleStr);
            console.log(authorStr);
            console.log();

            titleStr = "";
            authorStr = "";
        }
        else
        {
            console.log();
            console.log();
        }
    }


    console.log(defTextColor + menuUpStr + "\t" + menuDownStr + "\t" + prevPageStr + "\t" + nextPageStr);
    console.log(selectStr + "\t" + mainMenuStr + "\t" + quitStr);
}

function updateSearchInput(type, str="", errorStr)
{
    console.clear();
    console.log("Gutenberg Reader Search Entry\n\n");
    
    for(let i = 0; i < linesPerPage-4;i++)
    {
        console.log();
    }

    if(errorStr)
    {
        console.log(errorStr);
    }
    if(str.includes('~'))
    {
        console.log(selectTextColor + "Will exit the Gutenberg Reader");
    }
    else if(!str)
    {
        console.log(selectTextColor + 'Will return to Main Menu');
    }
    else
    {
        console.log();
    }
    

    console.log(defTextColor + `\nPlease enter the ${type} to search for: ` + str);
    console.log(`\n\nEnter an empty search to return to Main Menu\n`);
    console.log("Enter ~ in any search to exit the Gutenberg Reader");
}



/***************************************
 * 
 * 
 *      Select From Menu Functions
 * 
 * 
 **************************************/ 
async function selectMainMenu({cursorPos})
{
    return new Promise(async resolve => 
    {
        var quit = false;
        var data = null;

        if(cursorPos == mainMenuLen-1)
        {
            data = "continue";
        }
        else
        {
            try
            {
                [data,quit] = await searchBooks(cursorPos);
            }
            catch(error)
            {
                console.error("starting book search", error);
            }
        }

        resolve ((a,b,c,d) => 
        { 
            return [0, quit, data, d];
        })
    });
}

async function selectContinueMenu({cursorPos, data})
{
    try
    {
        var data = await getData(ids + data[cursorPos]);
        data = data.results;

        var formats = Object.keys(data[cursorPos].formats);
        var bookURL = null;
    
        for(let i = 0; i < formats.length; i++)
        {
            if(formats[i].match(bookTypeRegex))
            {
                bookURL = formats[i];
            }
        }

        if(bookURL)
        {
            bookURL = data[cursorPos].formats[bookURL];
            var book = await getBook(bookURL);
        }
    }
    catch(error)
    {
        console.error("getting book to continue");
    }

    return (a,b,c,d) => 
    { 
        return [data[cursorPos], b, book, d];
    }
}

async function selectSearchMenu({cursorPos, curPage, data})
{
    var index = cursorPos + (curPage * booksPerPage);
    var formats = Object.keys(data[cursorPos].formats);
    var url = null;
    var book = null;

    for(let i = 0; i < formats.length; i++)
    {
        if(formats[i].match(bookTypeRegex))
        {
            url = formats[i];
        }
    }

    if(url)
    {    
        url = data[cursorPos].formats[url];

        try
        {
            book = await getBook(url);
        }
        catch(error)
        {
            console.error("retrieving book from search", error);
        }
    }

    return (a,b,c,d) => 
    { 
        return [data[index].id, b, book, d];
    }
}



/***************************************
 * 
 * 
 *      Book Related Functions
 * 
 * 
 **************************************/ 

// gets the search string and queries Gutendex 
// for book information
// TODO: add additional search types
// TODO: make capable of replacing split options 
// on main menu
async function searchBooks(typeNum)
{
    var quit = false;
    var raw = null;
    var books = null;
    var splitRegex = /[^A-Za-z0-9]/g;
    var query = "";

    try
    {
    query = await stringBuilder(searchTypes.get(typeNum));
    var origQuery = query.toLowerCase();
    }
    catch(error)
    {
        console.error('building search string', error);
    }

    if (query.includes('~'))
    {
        quit = true;
    }
    else if(query)
    {
        try
        {
            raw = await getData(search + query);
            
            // get all the results
            if(raw.count > 0)
            {
                books = raw.results                         

                while(raw.next != null)
                {
                    query = raw.next.replace(searchURL, '');
                    
                    raw = await getData(query);     // get next page of results

                    if(raw.count > 0)
                    {
                        books.push(...raw.results);  // use spread operator to push all at once
                    }
                }
            }

            if(books && books.length > 0)
            {
                books = filterBooks(books, origQuery.toLowerCase().split(splitRegex).filter(Boolean), searchTypes.get(typeNum))
            };
        }
        catch(error)
        {
            console.error('getting book information json', error);
        }


    }

    return [books, quit];
}

function filterBooks(rawBooks, query, searchType)
{
    var filteredBooks = [];


    for(let i = 0; i < rawBooks.length;i++)
    {
        let curBook = rawBooks[i];
        let title = "";
        let author = "";



        if(searchType === searchTypes.get(0))
        {
            if(curBook.title.length > 0)
            {
                title = curBook.title.toLowerCase();
                if(query.every((word)=>title.includes(word)))
                {
                    filteredBooks.push(curBook);
                }
            }
        }
        else if(searchType === searchTypes.get(1))
        {
            if(curBook.authors.length > 0)
            {
                author = curBook.authors[0].name.toLowerCase();
                if(query.every((word)=>author.includes(word)))
                {
                    filteredBooks.push(curBook);
                }
            }
        }    
    }

    return filteredBooks;
}

// build a string from consecutive keypresses
// TODO: Show cursor at end of input prompt
async function stringBuilder(type)
{
    return new Promise(async resolve => 
    {
        var str = "";             // string to be returned
        var finished = false;       // string entry finished flag
        var keyInt = null;          // integer value for utf-8 key code
        var key = null;             // utf-8 encoded key code

        updateSearchInput(type);

        while(!finished)
        {
            try
            {
                var key = await getKeyPress();
                keyInt = Buffer.from(key).toString('hex');  // convert to hex first
                keyInt = parseInt(keyInt, 16);              // convert to decimal integer
            }
            catch(error)
            {
                console.error("Getting key press", error);
            }

            if(keyInt === backspaceInt)
            {
                if(str !== "")
                {
                    str = str.slice(0,-1);
                }
            }
            else if(keyInt === enterInt)
            {
                finished = true;
            }
            else
            {
                str += key;
            }
            
            updateSearchInput(type, str);
        }

        resolve(str);
    });
}

// get the Gutendex query data
async function getData(str){
    try
    {
        const request =  await fetch(searchURL + str);
        const json = await request.json();
        
        return json;
    }
    catch(error)
    {
        console.error("fetching book data", error);
    }
}

// get the book text from Gutenberg
async function getBook(bookURL)
{
    try
    {
        const request = await fetch(bookURL);
        var text = await request.text();
        const book = formatBook(text);

        return book;
    }
    catch(error)
    {
        console.error('fetching book from gutenberg', error);
    }
}


// formats the book text into readily consumable pages
// NOTE: This functions is disgusting. sorry in advance.
// TODO: improve format, track previous tag for 
// nested tags ie Content -> Chapter, Chapter, Chapter
// TODO: remove Lists of Ilustrations
function formatBook(text)
{
    const startEndRegex = /\*{3}.+\*{3}/g                                                                   // Matches on the start and end of book notices
    const illustrateRegex = /\[\billustration\b.*\](\\n|\s){0,1}/gi                                                    // Matches on illustration tags
    const newlinesRegex = /(\n|\r)+$/gm                                                                     // Matches on newlines and carriage returns
    const chapterRegex = /(^\bchapter\s*\.*[ivx]*\.*(\\n|\s){0,1}\b)/im
    const contentsRegex = /(^\bcontents\b)/im
    const explanatoryRegex = /(^\bexplanatory\b)/im;
    const prefaceRegex = /(^\bpreface\b)/im;
    const sectionsRegex = /(^\billustration\s*.*(\\n|\s)+\b)/im
    const oneIllustRegex = /^\[*\billustration[s.]*\b.*\]*\s/im    
    const punctNLRegex = /(?:[.?'"”])\n$/im                                                                 // Matches on punctuation followed by newline
    var chapterStart = true;
    var extraLines = 0;
    var curLineNum = 0;
    var totalLines = 0;
    var page = [];
    var book = [];

    // Remove start and end of book notices
    var matches = text.match(startEndRegex);
    var startIndex = text.indexOf(matches[0]) + matches[0].length + 1;
    var endIndex = text.indexOf(matches[1]);

    text = text.substring(startIndex, endIndex);

    // Remove illustration tags
    text = text.replace(illustrateRegex, '');

    // Remove excess new lines
    text = text.replace(newlinesRegex, '');

    // Replace underscores with spaces
    text = text.replaceAll('_.', ".");
    text = text.replaceAll('_', ' ');
    
    // break text up into lines to form pages
    text = text.split(/(?<=\n)/).filter(Boolean); 

    

    // put pages together
    for(let i = 0; i < text.length; i++)
    {
        // is it a chapter label?
        if(chapterRegex.test(text[i]))
        {
            chapterStart = true;

            // look ahead
            for(let j = 1; j < 10; j++)
            {
                if(i+j < text.length)
                {
                    if(chapterRegex.test(text[i+j]))
                    {
                        chapterStart = false;
                    }
                }
            }

            // look behind
            for(let k = 10; k > 0; k--)
            {
                if(i-k >= 0)
                {
                    if(chapterRegex.test(text[i-k]))
                    {
                        chapterStart = false;
                    }
                }
            }

            if(chapterStart)
            {
                chapterStart = false;
                page.push(selectTextColor + text[i]);

            }
            else
            {
                page.push(defTextColor + text[i]);
            }

            curLineNum++;
        }
        else if (contentsRegex.test(text[i]) || prefaceRegex.test(text[i])|| explanatoryRegex.test(text[i]) || oneIllustRegex.test(text[i]))
        {
            page.push(selectTextColor + text[i]);
            curLineNum++;
        }
        // is it a line with punctuation at the end?
        else if(punctNLRegex.test(text[i]))
        {
            if(curLineNum >= linesPerPage-2)
            {
                page.push(defTextColor + text[i].replace('\n', ''));
            }
            else
            {
                page.push(defTextColor + text[i]);
            }
            curLineNum++;
        }
        else
        {
            page.push(defTextColor + text[i].replace('\n', ''));
        }
        curLineNum++;

        totalLines = 1;

        // fix line count
        for(let i = 0; i < page.length; i++)
        {  
            // does the line have an extra newline?
            if(/\n$/m.test(page[i]))
            {
                totalLines++;
            }
            totalLines++;
        }

        if(totalLines >= linesPerPage)
        {
            curLineNum = linesPerPage;
        }

        // is the next line a section tag or have we reached our line limit?
        if(contentsRegex.test(text[i+1]) || prefaceRegex.test(text[i+1])|| explanatoryRegex.test(text[i+1]) || oneIllustRegex.test(text[i+1]) || curLineNum >= linesPerPage || chapterRegex.test(text[i+1]))
        {
            if(chapterRegex.test(text[i+1]))
            {
                chapterStart = true;
                // look ahead
                for(let j = 1; j < 10; j++)
                {
                    if(i+j+1 < text.length)
                    {
                        if(chapterRegex.test(text[i+1+j]))
                        {
                            chapterStart = false;
                        }
                    }
                }

                    // look behind
                for(let k = 10; k > 1; k--)
                {
                    if(i-k >= 0)
                    {
                        if(chapterRegex.test(text[i+1-k]))
                        {
                            chapterStart = false;
                        }
                    }
                }
                
                if(chapterStart)
                {
                    for(let i = 0; i < page.length; i++)
                    {   
                        // does the line have an extra newline?
                        if(/\n$/m.test(page[i]))
                        {
                            extraLines++;
                        }
                    }
    
                    extraLines = linesPerPage - page.length - extraLines
    
                    for (let i = 0; i < extraLines; i++)
                    {
                        page.push(' ');
                    }


                    totalLines = 0;
                    // fix line count
                    for(let i = 0; i < page.length; i++)
                    {  
                        // does the line have an extra newline?
                        if(/\n$/m.test(page[i]))
                        {
                            totalLines++;
                        }
                        totalLines++;
                    }

                    if(totalLines < linesPerPage)
                    {
                        page.push(' ');
                    }

                    book.push(page);
                    page = [];
                    curLineNum = 0;
                    extraLines = 0;
                    chapterStart = false;
                }
            }
            else
            {
                for(let i = 0; i < page.length; i++)
                {   
                    // does the line have an extra newline?
                    if(/\n$/m.test(page[i]))
                    {
                        extraLines++;
                    }
                }

                extraLines = linesPerPage - page.length - extraLines

                for (let i = 0; i < extraLines; i++)
                {
                    page.push(' ');
                }

                if(/\n$/.test(page[page.length-1]))
                {
                    page[page.length-1] = page[page.length-1].replace(/\n$/, '');
                }

                totalLines = 0;
                // fix line count
                for(let i = 0; i < page.length; i++)
                {  
                    // does the line have an extra newline?
                    if(/\n$/m.test(page[i]))
                    {
                        totalLines++;
                    }
                    totalLines++;
                }

                if(totalLines < linesPerPage)
                {
                    page.push(' ');
                }

                book.push(page);
                page = [];
                curLineNum = 0;
                extraLines = 0;
            }   
        }
    }

    return book;    
}

// display the book text
// TODO: Add goto page
function readBook(curPage, data)
{
    console.clear();
    console.log("Gutenberg Reader Book")
    console.log('\n');
    var startIndex = curPage * linesPerPage;
    var line = "";

    for(var i = 0; i < data[curPage].length; i++)
    {
        line = data[curPage][i];
        console.log(line);
    }

    console.log('\n')
    console.log(`Page (${curPage+1}/${data.length})`);
    console.log(prevPageStr + '\t' + nextPageStr + '\t' + mainMenuStr + '\t' + quitStr);
}




// central function of program
// TODO: add options menu
// -Resize width
// -Resize height
// -Change highlight color
async function main()
{
    const rOut = process.stdout;
    rOut.write(hideCursor);
    var quit = false;
    var cursorPos = 0;
    var curPage = 0;
    var input = null;
    var data = null;
    var prevBooks = null;
    var prevData = null;
    var navResult = null;


    do
    {
        // Main Menu Operations
        do
        {
            showMainMenu({cursorPos:cursorPos, hasRead: prevBooks ? true : false});

            try
            {
                input = await getKeyPress();

                if (menuNavFunc.has(input))
                {
                    navResult = await menuNavFunc.get(input)({cursorPos:cursorPos, showMenu:showMainMenu, hasRead: prevBooks ? true : false});

                    [cursorPos, quit, data] = await navResult(cursorPos, quit, data);
                }
            }
            catch(error)   // promise broke
            {
                console.error('navigating main menu', error);
            }
        } while (![selectKey, quitKey].includes(input));
 
        // Continue Selection Operations
        if(data == "continue")
        {
            do
            {
                navResult = await showContinueMenu({cursorPos:cursorPos, data:prevBooks, prevData:prevData});

                [cursorPos, quit, data, prevData] = await navResult(cursorPos, quit, data, prevData);

                try
                {
                input = await getKeyPress();

                if (continueNavFunc.has(input))
                    {
                        navResult = await continueNavFunc.get(input)({cursorPos:cursorPos, showMenu:showContinueMenu, data:prevBooks});
        
                        [cursorPos, quit, data, prevData] = await navResult(cursorPos, quit, data, prevData);
                    }
                }
                catch(error)
                {
                    console.error('continue menu navigation', error);
                }
            } while(![mainMenuKey, selectKey, quitKey].includes(input))
        }
        // Book Selection Operations
        else if (data)
        {
            do
            {
                showSearchMenu(cursorPos, curPage, data);

                try
                {
                    input = await getKeyPress();
                    
                    if(searchNavFunc.has(input))
                    {
                            navResult = await searchNavFunc.get(input)({cursorPos:cursorPos, showMenu:showSearchMenu, curPage:curPage, data:data});

                            [cursorPos, quit, data, curPage] = await navResult(cursorPos, quit, data, curPage);
                    }
                }
                catch(error)
                {
                    console.error("navigating search menu");
                }

            } while(![mainMenuKey, selectKey, quitKey].includes(input));
        }
        
        // Read Book Operations
        if (data && ![mainMenuKey, quitKey].includes(input))
        {
            if(!prevBooks)
            {
                prevBooks = [];
            }

            // have we already seen this before?
            if(!prevBooks.includes(cursorPos))
            {
                prevBooks.reverse();
                prevBooks.push(cursorPos);
                prevBooks.reverse();
            }

            // have we seen more than 10 books?
            if(prevBooks.length > booksPerPage)
            {
                prevBooks.reverse();
                prevBooks = prevBooks.slice(1);
                prevBooks.reverse();
            }
            
            do
            {
                readBook(curPage, data);

                try
                {   input = await getKeyPress();

                    if(bookNavFunc.has(input))
                    {
                        navResult = bookNavFunc.get(input)({cursorPos:cursorPos, showMenu:readBook, curPage:curPage, data:data});

                        [cursorPos, quit, data, curPage] = navResult(cursorPos, quit, data, curPage);
                    }
                }
                catch(error)
                {
                    console.error("getting book to continue");
                }
            } while(![mainMenuKey, quitKey].includes(input));
        }

        curPage = 0;

    }while (!quit);
    
    console.log(showCursor);
    console.clear();
    process.exit();
        
}

try
{
await main()
}
catch(error)
{
    console.error('main function call', error);
}