> **Content correction — 16 November 2026:** Corrected pgvector’s cosine-distance operator and the distinction between vectors and full-text search. Removed unsourced numeric citations and the 80/20 claim. Capacity and semantic quality require workload-specific evaluation; cosine values are geometry, not a truth or meaning certificate.

> Embeddings represent data as vectors for similarity-based retrieval. pgvector stores and searches those embeddings within PostgreSQL; full-text search is a different, keyword-based approach that may not require embeddings. Cosine similarity measures vector direction, not guaranteed meaning. Choose and benchmark retrieval methods against real queries and access-control requirements.

## What Are Embeddings, Really?

At their core, embeddings convert diverse data types—like text, images, audio, or even graphs—into dense, low-dimensional numerical vectors. Think of it like this: if you have a word, a sentence, or even a whole document, an embedding model turns that complex human-readable information into a list of numbers. These numbers capture the semantic meaning and context of the original data.

Imagine a 300-dimensional space. Each word or phrase isn't just a point in that space, but its position relative to other words tells you how similar or related they are. Words with similar meanings, like "doctor" and "physician," will have vectors that point in roughly the same direction and are close to each other. Opposites such as “hot” and “cold” may be close because they appear in similar contexts; distance is model-dependent.

### The Magic of Cosine Similarity

Once your text is turned into these vectors, you can do powerful things with them. The most common operation is calculating *cosine similarity*. This metric tells you how similar two vectors are by measuring the cosine of the angle between them. For nonzero vectors, cosine similarity 1 means the same direction (not necessarily the same magnitude), 0 means orthogonal directions and -1 means opposite directions. These values do not prove identical, unrelated or opposite human meanings.



This is why embeddings are so crucial for tasks like semantic search. Instead of just matching keywords, you can find documents that are *conceptually* similar to your query, even if they don't share exact words. For example, searching "how to fix a leaky tap" could return results about "plumbing repairs" or "faucet maintenance" because their embeddings are semantically close.

## When Embeddings Shine (and When They Don't)

Embeddings are a cornerstone of modern AI applications, especially for Retrieval Augmented Generation (RAG) systems, which could retrieve relevant study material for an educational application; no particular TestsPrep deployment is established by this example. (If you're building an LLM-powered product, I highly recommend reading my article on [RAG: How Indian AI Teams Make LLMs Actually Useful](https://www.inbharat.ai/learn-ai-with-reeturaj/rag)).

They are excellent for:

1.  **Semantic Search:** Finding documents based on meaning, not just keywords. Crucial for customer support, internal knowledge bases, or even e-commerce product discovery.
2.  **Recommendation Systems:** Suggesting similar items (products, articles, movies) based on user history or item descriptions.
3.  **Clustering and Classification:** Grouping similar pieces of data together or assigning them to categories.
4.  **Anomaly Detection:** Identifying data points that are semantically unusual compared to others.

However, for many common use cases, especially when you're just starting to integrate AI features into an existing Indian product, the overhead of a dedicated vector database might be overkill. This is where `pgvector` and Full-Text Search come into play.

## The Indian Reality: Cost, Complexity, and Existing Infrastructure

When we build for Bharat, we always consider cost, latency on varied network conditions (from 4G in Tier-2 cities to fiber in metros), and the existing tech stack of SMBs. Adding a new, specialized database like Pinecone or Weaviate for vector search introduces:

*   **Additional Cost:** Dedicated vector databases often come with a price tag, both for the service itself and the operational overhead.
*   **Operational Complexity:** Another database to manage, monitor, back up, and secure. This means more engineering hours, which are precious for small Indian teams.
*   **Data Sync Challenges:** Keeping your primary data store and your vector store in sync can be tricky, leading to stale data or complex ETL pipelines.

### The Power of `pgvector`

PostgreSQL is the workhorse database for countless Indian startups. It's robust, reliable, and most teams already know how to manage it. The `pgvector` extension changes the game by allowing you to store and query embeddings directly within your existing PostgreSQL database.

Here's why `pgvector` is often a smarter choice for your first AI feature:

1.  **Zero New Infrastructure:** You're leveraging your existing Postgres instance. No new servers, no new services to learn.
2.  **Simplified Data Management:** Your text data and its embeddings live side-by-side in the same table. No need for complex data synchronization between different systems.
3.  **Cost-Effective:** If you're already paying for a Postgres instance, storage, indexes, memory and query compute still have costs that should be measured.
4.  **Familiarity:** Your team already knows SQL. Querying vectors becomes another SQL operation.

Let's say you have a table `documents` with `id`, `content`, and `embedding` (a `vector` type column). A simple similarity search looks like this:

```sql
SELECT id, content, 1 - (embedding <=> '[query_embedding]') AS similarity
FROM documents
ORDER BY similarity DESC
LIMIT 5;
```

The `<=>` operator is cosine distance; `<->` is L2 distance. `1 - cosine distance` gives cosine similarity. Replace the illustrative placeholder with a bound vector parameter in actual code. `pgvector` supports various distance metrics and indexing (like HNSW) for performance. For a detailed guide on `pgvector`, I recommend checking out the official documentation or a good tutorial.

### When Full-Text Search (FTS) is Enough

Before you even consider embeddings, ask yourself: *Does my problem truly require semantic understanding, or can keyword matching suffice?*

PostgreSQL's built-in Full-Text Search is incredibly powerful for many use cases. If your users are searching for specific keywords, phrases, or combinations of terms, FTS can deliver fast, relevant results with minimal setup. For example, if you're building an internal document search where users know exactly what terms they're looking for, FTS is often more than adequate.

Consider a scenario where a user on Sahayaak Seva is looking for a specific medical guideline document by its title or known keywords. FTS will be faster and simpler to implement than an embedding-based solution. It's about matching intent.

## The Trade-offs: `pgvector` vs. Dedicated Vector Stores

| Feature              | `pgvector` (PostgreSQL)                                  | Dedicated Vector Store (e.g., Pinecone, Weaviate)                  |
| :------------------- | :------------------------------------------------------- | :----------------------------------------------------------------- |
| **Setup/Ops Cost**   | Low (leverages existing Postgres)                        | High (new infrastructure, learning curve, separate billing)        |
| **Data Sync**        | Automatic (same database)                                | Manual/ETL needed, potential for data staleness                    |
| **Scalability**      | Scales with Postgres; good for moderate datasets (millions) | Designed for massive scale (billions of vectors)                   |
| **Query Latency**    | Very good for medium scale; depends on Postgres tuning   | Optimized for low-latency similarity search at extreme scale       |
| **Feature Set**      | Basic vector operations, HNSW indexing                   | Advanced filtering, hybrid search, multi-modal embeddings, RAG-specific features |
| **Familiarity**      | High (SQL, Postgres ecosystem)                           | Low (new APIs, concepts, tools)                                    |

For most Indian SMBs building their first AI features, `pgvector` offers a compelling balance of power and practicality. It allows you to experiment with semantic search, build your RAG pipeline, and get your AI features to market faster without committing to a complex and expensive new piece of infrastructure. Only when you hit the scaling limits of `pgvector` (e.g., tens of millions of vectors with very high query throughput) should you consider migrating to a dedicated vector database.

## My Approach at InBharat

For a study-assistant prototype, pgvector is a reasonable baseline when PostgreSQL is already available. This is a design recommendation, not evidence of a specific TestsPrep deployment or measured infrastructure saving. Benchmark data size, recall, latency, concurrent queries and operational cost before choosing a separate vector service.

This pragmatic approach ensures we're building with the Indian context in mind: optimizing for cost, leveraging existing skills, and delivering value quickly. It's about smart engineering, not just chasing the latest shiny tech.

## Bottom Line

Embeddings are fundamental to modern AI, transforming complex data into a numerical format that allows for powerful semantic understanding. However, for many Indian product teams, especially when starting out, integrating `pgvector` into your existing PostgreSQL setup or even relying on robust Full-Text Search can provide significant AI capabilities without the added cost and complexity of a dedicated vector database. Choose the simplest solution that solves your problem effectively, and scale up only when your needs genuinely demand it. To learn more about how we build AI products for India, explore other articles on the [InBharat.ai](https://www.inbharat.ai) content hub, like [Desh Ka AI: What It Means to Build for Bharat](https://www.inbharat.ai/learn-ai-with-reeturaj/desh-ka-ai).

## FAQ

### Q1: Is `pgvector` suitable for all AI applications?

`pgvector` is excellent for many initial AI features, especially semantic search and RAG, within moderate datasets (up to tens of millions of vectors). For extremely large-scale applications with billions of vectors or very high query throughput, dedicated vector databases might offer better performance and advanced features.

### Q2: How does `pgvector` compare to cloud-managed vector services?

`pgvector` offers simplicity and cost-effectiveness by leveraging your existing PostgreSQL instance. Cloud services often provide managed scalability, advanced features, and potentially lower latency at extreme scale, but come with higher operational overhead and cost. The choice depends on your project's specific requirements and budget.

### Q3: Can I use Full-Text Search and embeddings together?

Absolutely. Many robust search systems combine keyword-based Full-Text Search with semantic search using embeddings. This hybrid approach allows you to capture both explicit keyword matches and conceptual relevance, providing a more comprehensive search experience for users.

## Technical reference

[pgvector querying documentation](https://github.com/pgvector/pgvector#querying) lists the distance operators.
