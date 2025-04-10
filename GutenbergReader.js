import { error } from "node:console";

// Gutendex URL constants
const searchURL = 'https://gutendex.com/books/';
const search = '?search=';
const ids = '?ids='
const booksPerGutPage = 32;

// Regex strings
const regexStrings = new Map([
    ["bookTypeRegex",  ['\\btext\\/plain\\b','g']],
    ["startEndRegex", ['\\*{3}.+\\*{3}','g']],                                                               // Matches on the start and end of book notices
    ["illustrateRegex", ['\\[\\billustration\\b.*\\](\\\\n|\\s){0,1}/','gi']],                                                    // Matches on illustration tags
    ["newlinesRegex", ['(\\n|\\r)+$/','gm']],                                                                     // Matches on newlines and carriage returns
    ["actLabelRegex", ['\\bact\\b','']],
    ["chapterRegex", ['^\\bchapter\\s*\\.*[0-9ivx]+\\.*(\\\\n|\\s){0,1}\\b$','im']],
    ["contentsRegex", ['^\\bcontent[s]+\\s*\\b','im']],
    ["explanatoryRegex", ['^\\bexplanatory\\s*(\\\\n|\\s){0,1}\\b','im']],
    ["prefaceRegex", ['^\\bpreface\\s*(\\\\n|\\s){0,1}\\b','im']],
    ["oneIllustRegex", ['^\\[*\\billustration[s.]*\\b','im']],    
    ["punctNLRegex", ['(?:[.?\\\'"”])\\n$','im']],
    ["allPuncRegex", ['[^\\w\\s]{3,}(\\\\n|\\s){0,1}','']],
    ['keepNLRegex', ['(?=[\n\r])|(?<=[\n\r])', '']]
]);

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
const selectTextColor = "\x1b[32m";
const errorTextColor = "\x1b[31m"
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
        return [cursorPos, false, c, d, null];
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
        return [cursorPos, false, c, d, null];

    };
}

function gotoNextPage({cursorPos, curPage, data, showMenu})
{
    var maxPage = null;
    
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
        return [0, false, c, curPage, null];
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
        return [0, false, c, curPage, null];
    }
}

function gotoMainMenu ()
{
    return (a,b,c,d) => 
        {
            return [0, b, null, 0, null];
        };
}

function exitReader()
{
    return (a,b,c,d) => 
    {
        return [0, true, null, 0, null];
    };
}



/***************************************
 * 
 * 
 *      Show Menu Functions
 * 
 * 
 **************************************/ 
function showMainMenu({cursorPos, hasRead, errorMsg})
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
        console.log('\n');
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

    errorMsg ? console.log(errorMsg) : console.log();
    
    console.log(defTextColor + "\n");
    console.log(menuUpStr + "\t" + menuDownStr + "\t" + selectStr + "\t" + quitStr);
}


// needs data fetching moved so this function
// can only be responsible for displaying menu content
function showContinueMenu({cursorPos, data, errorMsg})
{
    var bookLines = booksPerPage;
    var titleStr = "";
    var authorStr = "";

    console.clear();
    console.log("Gutenberg Reader Continue Reading Menu\n\n")

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

        if(i < bookLines-2)
        {
            console.log();
        }
    }

    console.log();
    errorMsg ? console.log('\n' + errorMsg) : console.log('\n');

    console.log(defTextColor + menuUpStr + "\t" + menuDownStr + "\t" + selectStr)
    console.log(mainMenuStr + "\t" + quitStr);
}

function showSearchMenu(cursorPos, pageNum, data, errorMsg)
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
            console.log();
        }
    }

    errorMsg ? console.log('\n' + errorMsg) : console.log();

    console.log(defTextColor + menuUpStr + "\t" + menuDownStr + "\t" + prevPageStr + "\t" + nextPageStr);
    console.log(selectStr + "\t" + mainMenuStr + "\t" + quitStr);
}

function updateSearchInput(type, str="", errorStr)
{
    console.clear();
    console.log(defTextColor + "Gutenberg Reader Search Entry\n\n");
    
    for(let i = 0; i < linesPerPage-4;i++)
    {
        console.log();
    }



    if (errorStr)
    {
        console.log(errorStr);
    }
    else if(str.includes('~'))
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
    console.log();
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
        var errorMsg = null;

        if(cursorPos == mainMenuLen-1)
        {
            data = "continue";
        }
        else
        {
            try
            {
                [data,quit,errorMsg] = await searchBooks(cursorPos);
            }
            catch(error)
            {
                errorMsg = errorTextColor + "Error starting book search.";
            }
        }

        resolve ((a,b,c) => 
        { 
            if(!errorMsg)
            {
                a = 0;
                b = quit;
                c = data;
            }

            return [a,b,c, errorMsg];
        })
    });
}

async function selectContinueMenu({cursorPos, data})
{
    var errorMsg = null;
    var book = null;

    try
    {
        var data = null
        [data, errorMsg] = await getData(ids + data[cursorPos]);

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
            [book, errorMsg] = await getBook(bookURL, data[cursorPos].title);
        }
    }
    catch(error)
    {
        errorMsg = errorTextColor + "Error retrieving book to continue from Gutenberg."
    }

    return (a,b,c) => 
    { 
        if(!errorMsg)
        {
            a = data[cursorPos],
            c = book
        }

        return [a,b,c, errorMsg];
    }
}

async function selectSearchMenu({cursorPos, curPage, data})
{
    var index = cursorPos + (curPage * booksPerPage);
    var formats = Object.keys(data[cursorPos].formats);
    var url = null;
    var book = null;
    var errorMsg = null;

    for(let i = 0; i < formats.length; i++)
    {
        if(formats[i].match(regexStrings['bookTypeRegex']))
        {
            url = formats[i];
        }
    }

    if(url)
    {    
        url = data[cursorPos].formats[url];

        try
        {
            [book, errorMsg] = await getBook(url, data[cursorPos].title);
        }
        catch(error)
        {
            errorMsg = errorTextColor + "Error retriving book to read from Gutenberg."
        }
    }

    return (a,b,c,d) => 
    { 
        if(!errorMsg)
        {
            a = data[index].id;
            c = book;
        }

        return [a,b,c, d, errorMsg];
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
    var raw = null;
    var errorMsg = null;
    var statusStr = "";
    var numChunks = 1;
    var curChunk = 1;

    try
    {
        [query, errorMsg] = await stringBuilder(searchTypes.get(typeNum));
        var origQuery = query.toLowerCase();

        if (query.includes('~'))
        {
            quit = true;
        }
        else if(query)
        {
            try
            {
                statusStr = selectTextColor + "Retreiving data chunks from Gutendex..."; 
                updateSearchInput(searchTypes.get(typeNum), origQuery, statusStr);    
                [raw, errorMsg] = await getData(search + query);
                
                // get all the results
                if(raw && raw.count > 0)
                {
                    numChunks = Math.floor(raw.count / booksPerGutPage) + (raw.count % booksPerGutPage == 0 ? 0 : 1);
                    books = raw.results  

                    statusStr = selectTextColor + "Received Gutendex data chunk (" + curChunk + " / " + numChunks + ")"; 
                    updateSearchInput(searchTypes.get(typeNum), origQuery, statusStr);                      

                    while(raw.next != null)
                    {
                        query = raw.next.replace(searchURL, '');
                        curChunk++;
                        
                        [raw, errorMsg] = await getData(query);     // get next page of results
                        statusStr = selectTextColor + "Received Gutendex data chunk (" + curChunk + " / " + numChunks + ")"; 
                        updateSearchInput(searchTypes.get(typeNum), origQuery, statusStr);  
                        books.push(...raw.results);  // use spread operator to push all at once  
                    }

                    statusStr = selectTextColor + "Received Gutendex data chunk (" + curChunk + " / " + numChunks + ")"; 
                    updateSearchInput(searchTypes.get(typeNum), origQuery, statusStr);   
                }

                if(books && books.length > 0)
                {
                    books = filterBooks(books, origQuery.toLowerCase().split(splitRegex).filter(Boolean), searchTypes.get(typeNum))
                };
            }
            catch(error)
            {
                errorMsg = errorTextColor + "Error getting search data from Gutendex.";
            }
        }
    }
    catch(error)
    {
        errorMsg = errorTextColor + "Error getting search string.";
    }

    return [books, quit, errorMsg];
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
        var errorMsg = null;

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
                errorMsg = errorTextColor + "Error getting keypress from user.";
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

        resolve([str, errorMsg]);
    });
}

// get the Gutendex query data
async function getData(str)
{
    var errorMsg = "";

    try
    {
        var data = null;

        const request =  await fetch(searchURL + str);
        if(request.ok)
        {
            const json = await request.json();
        
            if(json)
            {
                data = json;
            }
        }
  
    }
    catch(error)
    {
        errorMsg = errorTextColor + "Error occured while getting data from Gutendex: " + error.cause.code;
    }

    return [data, errorMsg];
}

// get the book text from Gutenberg
async function getBook(bookURL, title)
{
    var errorMsg = null;

    try
    {
        var book = null;

        const request = await fetch(bookURL);
        if(request.ok)
        {
            const text = await request.text();

            if(text)
            {
                book = formatBook(text, title.split());
            }
            else
            {
                book = null;
            }
        }

        
    }
    catch(error)
    {
        errorMsg = errorTextColor + "Error while getting book from Gutenberg: " + error.cause.code;
    }

    return [book, errorMsg];
}


// formats the book text into readily consumable pages.
// TODO: improve format, track previous tag for 
// nested tags ie Content -> Chapter, Chapter, Chapter
// TODO: remove Lists of Ilustrations
// TODO: Error Handlers when not english text
function formatBook(text, title)
{
    var page = [];
    var book = [];
    var regexStr = regexStrings.get('startEndRegex')
    var regex = new RegExp(regexStr[0], regexStr[1]);

    // Remove start and end of book notices
    var matches = text.match(regex);
    var startIndex = text.indexOf(matches[0]) + matches[0].length + 1;
    var endIndex = text.indexOf(matches[1]);

    text = text.substring(startIndex, endIndex);

    // Remove illustration tags
    regexStr = regexStrings.get('illustrateRegex')
    regex = new RegExp(regexStr[0], regexStr[1]);
    text = text.replace(regex, '');

    // Remove excess new lines
    regexStr = regexStrings.get('newlinesRegex')
    regex = new RegExp(regexStr[0], regexStr[1]);
    text = text.replace(regex, '');

    // Replace underscores with spaces
    text = text.replaceAll('_.', ".");
    text = text.replaceAll('_', ' ');
    
    // break text up into lines to form pages
    regexStr = regexStrings.get('keepNLRegex')
    regex = new RegExp(regexStr[0], regexStr[1]);
    text = text.split(regex).filter(Boolean); 

    // put pages together
    for(let i = 0; i < text.length; i++)
    {
        let lineNum = i % linesPerPage;
        let curLine = null;
        let isSectionLabel = false;
        let isSectionStart = false;
        [curLine, isSectionLabel] = formatLine(text[i], title);
        
        // Check if page is complete before adding
        if(isSectionLabel && page.length > 0)
        {
            book.push(page);
            page = []
        }

        // Did we get an array of lines?
        if(Array.isArray(curLine))
        {
            // Is there room on the page for them?
            if(curLine.length + page.length <= linesPerPage)
            {
                page.push(...curLine);
            }
            else
            {
                // Move start to end to pop off in order
                curLine.reverse();

                do
                {
                    // get line difference as positive value
                    let remainingLines = curLine.length < page.length ? page.length - curLine.length : curLine.length - page.length;

                    // Push last lines on.
                    for(let i = 0; i < remainingLines; i++)
                    {
                        page.push(curLine.pop());
                    }

                    book.push(page);
                    page = [];
                } while(curLine.length > page.length);
            }
        }
        // just a single line

        if(page.length == linesPerPage)
        {
            book.push(page);
            page = [];
        }
    }

    return book;    
}

function formatLine(line, title)
{
    
    var formattedLine = "";
    var lineColor = null;

    var isSectionLabel = false;
    var isTitle = false;
    var regex = null;
    


    // Is this is a section label?
    regexStrings.forEach((expr, name) =>{
        regex = new RegExp(expr[0], expr[1])
        
        if(regex.test(line) && name != 'keepNLRegex')
        {
            isSectionLabel = true;
        }
    });

    for(let i = 0; i < title.length; i++)
    {
        var titleRegex = new RegExp(`${title[i]}`);

        if(titleRegex.test(line))
        {
            isTitle = true;
        }
    }

    if(isTitle || isSectionLabel)
    {
        lineColor = selectTextColor;
    }
    else
    {
        lineColor = defTextColor;
    }

    formattedLine += line;
    var regexStr = regexStrings.get('keepNLRegex');
    regex = new RegExp(regexStr[0], regexStr[1])
    formattedLine = line.split(regex);

    for(let i = 0; i < formattedLine.length; i++)
    {
        if(/(\n|\r)/.test(formattedLine))
        {
            formattedLine[i] = '';
        }
    }
    
    if(formattedLine.length > 1)
    {
        formattedLine.pop();
    }
    
    // last line always resets to default text color
    if(formattedLine.length > 0)
    {
        formattedLine[0] = lineColor + formattedLine[0];
        formattedLine[formattedLine.length-1] = formattedLine[formattedLine.length-1] + lineColor;
    }
    else
    {
        formattedLine.push(defTextColor);
    }

    return [formattedLine, isSectionLabel];
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

async function getPreviousBooks(data)
{
    var books = null;
    var bookData = null;
    var errorMsg = null;

    try
    {
        [bookData, errorMsg] = await getData(ids + data.join());

        if(bookData && bookData.count > 0)
        {
            bookData = bookData.results;

            if(bookData.length > 0)
            {
                books = [];

                for(let i = 0; i < data.length; i++)
                {
                    for(let j = 0; j < bookData.length; j++)
                    {
                        if(bookData[j].id == data[i])
                        {
                            books.push(bookData[j]);
                        }
                    }
                }
            }
        }    
    }
    catch(error)
    {
        errorMsg = errorTextColor + "Error occurred while getting data from Gutendex."
    }

    return [books, errorMsg];
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
    var prevData = null;
    var navResult = null;
    var errorMsg = null;


    do
    {
        // Main Menu Operations
        do
        {
            showMainMenu({cursorPos:cursorPos, hasRead: prevData ? true : false, errorMsg: errorMsg});

            try
            {
                input = await getKeyPress();

                if (menuNavFunc.has(input))
                {
                    navResult = await menuNavFunc.get(input)({cursorPos:cursorPos, showMenu:showMainMenu, hasRead: prevData ? true : false});

                    [cursorPos, quit, data, errorMsg] = await navResult(cursorPos, quit, data);
                }
            }
            catch(error)   // promise broke
            {
                errorMsg = errorTextColor + "Error getting main menu navigation function.";
            }
        } while (![selectKey, quitKey].includes(input));
 
        // Continue Selection Operations
        if(data == "continue" && !errorMsg)
        {
            [data, errorMsg] = getPreviousBooks(prevBooks)

            if(!errorMsg)
            {
                do
                {
                    showContinueMenu({cursorPos:cursorPos, data:data, errorMsg:errorMsg});

                    try
                    {
                    input = await getKeyPress();

                    if (continueNavFunc.has(input))
                        {
                            navResult = await continueNavFunc.get(input)({cursorPos:cursorPos, showMenu:showContinueMenu, data:data});
            
                            [cursorPos, quit, data, errorMsg] = await navResult(cursorPos, quit, data);
                        }
                    }
                    catch(error)
                    {
                        errorMsg = errorTextColor + "Error getting continue menu navigation function."
                    }
                } while(![mainMenuKey, selectKey, quitKey].includes(input))
            }

        }
        // Book Selection Operations
        else if (data && !errorMsg)
        {
            do
            {
                showSearchMenu(cursorPos, curPage, data, errorMsg);

                try
                {
                    input = await getKeyPress();
                    
                    if(searchNavFunc.has(input))
                    {
                            navResult = await searchNavFunc.get(input)({cursorPos:cursorPos, showMenu:showSearchMenu, curPage:curPage, data:data});

                            [cursorPos, quit, data, curPage, errorMsg] = await navResult(cursorPos, quit, data, curPage);
                    }
                }
                catch(error)
                {
                    errorMsg = errorTextColor + "Error getting search menu navigation function.";
                }

            } while(![mainMenuKey, selectKey, quitKey].includes(input));
        }
        
        // Read Book Operations
        if (data && ![mainMenuKey, quitKey].includes(input) && !errorMsg)
        {
            if(!prevData)
            {
                prevData = [];
            }

            // put oldest at front
            prevData.reverse();

            // have we already seen this before?
            if(prevData.includes(cursorPos))
            {
                prevData.splice(prevData.indexOf(cursorPos), 1);
            }

            // add/re-add the book to list as most recent
            if(!prevData.includes(cursorPos))
            {
                prevData.push(cursorPos);
            }

            // have we seen more than 10 books?
            if(prevData.length > booksPerPage)
            {
                // trim the list
                prevData = prevData.slice(1);
            }

            // put newest at front
            prevData.reverse();


            
            do
            {
                readBook(curPage, data, errorMsg);

                try
                {   input = await getKeyPress();

                    if(bookNavFunc.has(input))
                    {
                        navResult = bookNavFunc.get(input)({cursorPos:cursorPos, showMenu:readBook, curPage:curPage, data:data});

                        [cursorPos, quit, data, curPage, errorMsg] = navResult(cursorPos, quit, data, curPage);
                    }
                }
                catch(error)
                {
                    errorMsg = errorTextColor + "Error get book navigation menu function.";
                }
            } while(![mainMenuKey, quitKey].includes(input));
        }

        if(errorMsg)
        {
            cursorPos = 0;
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