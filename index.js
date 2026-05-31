import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import axios from "axios";
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const port = 3000;
const openLibraryUrl = "https://covers.openlibrary.org/b/isbn/";
const titleSearchUrl = "https://openlibrary.org/search.json";

const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "booknotes",
  password: process.env.databasePassword,
  port: 5432,
});
db.connect();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

const books = [];

async function getBooks() {
  try {
    const result = await db.query("SELECT * FROM books");

    const books = result.rows.map((book) => {
      return {
        ...book,
        formatted_date: new Date(book.date_read).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        }),
        cover_url: book.cover_id
          ? `https://covers.openlibrary.org/b/id/${book.cover_id}-L.jpg`
          : book.isbn
            ? `https://covers.openlibrary.org/b/isbn/${book.isbn}-L.jpg`
            : "/assets/no-cover.png",
      };
    });

    return books;
  } catch (err) {
    console.error(err);
    throw new Error("Error fetching books");
  }
}

async function findBookByTitle(title, author) {
  const response = await axios.get("https://openlibrary.org/search.json", {
    params: {
      title: title,
      limit: 10,
      fields: "title,author_name,isbn,cover_i",
    },
  });

  const books = response.data.docs;

  const book =
    books.find((book) => {
      const hasCover = book.cover_i || book.isbn;
      const matchesAuthor =
        !author ||
        book.author_name?.some((name) =>
          name.toLowerCase().includes(author.toLowerCase())
        );

      return hasCover && matchesAuthor;
    }) ||
    books.find((book) => book.cover_i || book.isbn) ||
    books[0];

  if (!book) {
    return null;
  }

  return {
    title: book.title,
    author: book.author_name ? book.author_name[0] : "",
    isbn: book.isbn ? book.isbn[0] : "",
    cover_id: book.cover_i || null,
    cover_url: book.cover_i
      ? `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg`
      : book.isbn
        ? `https://covers.openlibrary.org/b/isbn/${book.isbn[0]}-L.jpg`
        : "",
  };
}

app.get("/", async (req, res) => {
  const books = await getBooks();
  const bookCount = books.length;
  const reviews = await db.query(`
      SELECT COUNT(*) 
      FROM books
      WHERE notes IS NOT NULL
      AND TRIM(notes) != ''
  `);
  const aveRatings = await db.query(`
      SELECT AVG(rating) 
      FROM books
      WHERE rating IS NOT NULL
  `);
  const averageRating =
    aveRatings.rows[0].avg === null
      ? "0.0"
      : Number(aveRatings.rows[0].avg).toFixed(1);

  res.render("index.ejs", { books: books, bookCount: bookCount, reviewCount: reviews.rows[0].count, averageRating: averageRating });
});

app.get("/books/newBook", (req, res) => {
  res.render("addBook.ejs", { book: null });
});

app.post("/books", async (req, res) => {
  let { title, author, isbn, rating, date_read, notes } = req.body;

  title = title?.trim();
  author = author?.trim();
  isbn = isbn?.trim();

  try {
    const openLibraryBook = await findBookByTitle(title, author);

    if (openLibraryBook) {
      author = author || openLibraryBook.author;
      isbn = isbn || openLibraryBook.isbn;
    }

    await db.query(
      `INSERT INTO books (title, author, isbn, rating, date_read, notes, cover_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        title,
        author || null,
        isbn || null,
        rating || null,
        date_read || null,
        notes || null,
        openLibraryBook?.cover_id || null,
      ]
    );

    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
  const openLibraryBook = await findBookByTitle(title, author);
  console.log("Open Library Book:", openLibraryBook);
});

app.get("/books/:id/edit", async (req, res) => {
  const id = req.params.id;

  const result = await db.query("SELECT * FROM books WHERE id = $1", [id]);
  const book = result.rows[0];

  res.render("addBook.ejs", { book: book });
});

app.post("/books/:id/delete", async (req, res) => {
  const id = req.params.id;
  try {
    await db.query("DELETE FROM books WHERE id = $1", [id]);
    console.log(`Delete book with ID: ${id}`);
    res.redirect("/");
  } catch (err) {
    console.log(err);
  }
});

app.post("/books/:id/edit", async (req, res) => {
  const id = req.params.id;
  let { title, author, isbn, rating, date_read, notes } = req.body;

  title = title?.trim();
  author = author?.trim();
  isbn = isbn?.trim();

  try {
    const openLibraryBook = await findBookByTitle(title, author);

    if (openLibraryBook) {
      author = author || openLibraryBook.author;
      isbn = isbn || openLibraryBook.isbn;
    }

    await db.query(
      `UPDATE books
       SET title = $1,
           author = $2,
           isbn = $3,
           rating = $4,
           date_read = $5,
           notes = $6,
           cover_id = $7
       WHERE id = $8`,
      [
        title,
        author || null,
        isbn || null,
        rating || null,
        date_read || null,
        notes || null,
        openLibraryBook?.cover_id || null,
        id,
      ]
    );

    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating book");
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});