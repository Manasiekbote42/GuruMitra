import { useState, useEffect, useMemo } from 'react';
import Card from '../../components/Card';
import api from '../../services/api';
import { trainingLibraryGetList, trainingLibraryGetCategories } from '../../services/api';

export default function TrainingLibraryView() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('');
  const [subCategory, setSubCategory] = useState('');
  const [search, setSearch] = useState('');
  const [viewingText, setViewingText] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      trainingLibraryGetList(),
      trainingLibraryGetCategories(),
    ])
      .then(([list, cats]) => {
        setItems(list);
        setCategories(cats);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const filteredItems = useMemo(() => {
    let list = items;
    if (category) list = list.filter((i) => i.category === category);
    if (subCategory) list = list.filter((i) => i.sub_category === subCategory);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (i) =>
          (i.title && i.title.toLowerCase().includes(q)) ||
          (i.description && i.description.toLowerCase().includes(q))
      );
    }
    return list;
  }, [items, category, subCategory, search]);

  const subCategoriesForCategory = useMemo(() => {
    if (!category) return [];
    return [...new Set(categories.filter((c) => c.category === category).map((c) => c.sub_category))];
  }, [categories, category]);

  const openPdf = (id) => {
    setPdfLoading(id);
    api
      .get(`/api/training-library/file/${id}`, { responseType: 'blob' })
      .then((res) => {
        const url = URL.createObjectURL(res.data);
        window.open(url, '_blank', 'noopener');
      })
      .catch(() => {})
      .finally(() => setPdfLoading(null));
  };

  const grouped = useMemo(() => {
    const map = {};
    filteredItems.forEach((item) => {
      const key = `${item.category}|${item.sub_category}`;
      if (!map[key]) map[key] = { category: item.category, sub_category: item.sub_category, items: [] };
      map[key].items.push(item);
    });
    return Object.values(map).sort((a, b) => a.category.localeCompare(b.category) || a.sub_category.localeCompare(b.sub_category));
  }, [filteredItems]);

  return (
    <div className="space-y-6">
      <Card title="Training Library">
        <p className="text-sm text-gray-600 mb-4">
          Browse policy and training materials by category. Open PDFs or read text content below.
        </p>

        <div className="flex flex-wrap gap-3 mb-6">
          <input
            type="text"
            placeholder="Search by title or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setSubCategory('');
            }}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm"
          >
            <option value="">All categories</option>
            {[...new Set(categories.map((c) => c.category))].map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <select
            value={subCategory}
            onChange={(e) => setSubCategory(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm"
          >
            <option value="">All subcategories</option>
            {subCategoriesForCategory.map((sub) => (
              <option key={sub} value={sub}>{sub}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-gray-100 rounded-lg" />
            ))}
          </div>
        ) : grouped.length === 0 ? (
          <p className="text-gray-500 text-sm py-8 text-center">No training content found.</p>
        ) : (
          <div className="space-y-6">
            {grouped.map((group) => (
              <div key={`${group.category}-${group.sub_category}`}>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">
                  {group.category} → {group.sub_category}
                </h4>
                <ul className="space-y-3">
                  {group.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-gray-200 bg-gray-50/50 hover:border-gray-300"
                    >
                      <div className="min-w-0">
                        <h5 className="font-medium text-gray-800">{item.title}</h5>
                        {item.description && (
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2">{item.description}</p>
                        )}
                        <span className="inline-block mt-2 text-xs text-gray-500 capitalize">
                          {item.content_type} · Visible to {item.visible_to}
                        </span>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {item.content_type === 'pdf' && item.content_view_url && (
                          <button
                            type="button"
                            onClick={() => openPdf(item.id)}
                            disabled={pdfLoading === item.id}
                            className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
                          >
                            {pdfLoading === item.id ? 'Opening…' : 'Open PDF'}
                          </button>
                        )}
                        {item.content_type === 'text' && (item.content_text || item.description) && (
                          <button
                            type="button"
                            onClick={() => setViewingText({ title: item.title, text: item.content_text || item.description || '' })}
                            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-100"
                          >
                            View text
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>

      {viewingText && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setViewingText(null)}
        >
          <div
            className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-800">{viewingText.title}</h3>
              <button
                type="button"
                onClick={() => setViewingText(null)}
                className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="p-5 overflow-auto flex-1 text-sm text-gray-700 whitespace-pre-wrap">
              {viewingText.text || 'No content.'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
