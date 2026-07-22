# Goodreads Magic Lens Visualization

## Setup
1. Download the Kaggle dataset: Goodreads Books by jealousleopard.
2. Put the CSV file into this folder.
3. Rename it to `books.csv`.
4. Start a local server, for example with VS Code Live Server.
5. Open `index.html`.

Do not open the HTML file directly via `file://`, because browsers often block CSV loading from local files.

## Visualization
- X-axis: number of pages
- Y-axis: average rating
- Point size: ratings count
- Point color: language code

## Magic Lens modes
- Detail Lens: shows labels and local summary statistics.
- Filter Lens: dims books below rating 4.0 inside the lens.
- Semantic Lens: emphasizes books in the local area and displays labels.

## Suggested slide outline
1. Title: Interactive Goodreads Visualization using Magic Lenses
2. Dataset: Goodreads Books from Kaggle
3. Data structure: Book as information object; attributes are title, author, rating, pages, ratings count, language, publication date
4. Visualization design: scatterplot mapping
5. Magic Lens interaction: local filtering and local detail-on-demand
6. Course concepts: nominal, quantitative, temporal attributes; multivariate data; focus + context; interaction
7. Demo
8. Conclusion
