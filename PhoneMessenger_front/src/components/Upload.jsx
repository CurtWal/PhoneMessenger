import React, { useCallback, useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";

const FIELDS = ["PhoneNumber"];

export default function Upload() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [formRows, setFormRows] = useState([]);
  const [newRow, setNewRow] = useState(
    FIELDS.reduce((acc, key) => ({ ...acc, [key]: "" }), {}),
  );

  /** ─── Fetch CRM on load ─────────────────────── */
  useEffect(() => {
    const token = localStorage.getItem("token");
    const userId = localStorage.getItem("userId");
    if (!userId) return;

    setLoading(true);
    fetch(`${import.meta.env.VITE_API_URL}/crm/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((contacts) => setFormRows(contacts))
      .catch(() => setError("Failed to fetch CRM data"))
      .finally(() => setLoading(false));
  }, []);

  /** ─── Drag & Drop CSV Upload ─────────────────── */
  const onDrop = useCallback((acceptedFiles) => {
    const file = acceptedFiles[0];
    const token = localStorage.getItem("token");
    const userId = localStorage.getItem("userId");

    const formData = new FormData();
    formData.append("file", file);

    fetch(`${import.meta.env.VITE_API_URL}/crm-upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          console.error("UPLOAD ERROR:", data);
          throw new Error(data.error || "Upload failed");
        }
        return data;
      })
      .then(() =>
        fetch(`${import.meta.env.VITE_API_URL}/crm/${userId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      )
      .then((res) => res.json())
      .then((contacts) => setFormRows(contacts))
      .catch(() => setError("Failed to upload CRM file"));
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  /** ─── Input Updates ─────────────────────────── */
  const handleInputChange = (e, idx) => {
    const { name, value } = e.target;

    setFormRows((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, [name]: value } : row)),
    );
  };

  // Save a single field for an existing contact (on blur)
  const handleSaveField = async (idx, name, value) => {
    const row = formRows[idx];
    if (!row || !row._id) return; // only save if contact already exists in DB

    const token = localStorage.getItem("token");
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/crm/${row._id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ [name]: value }),
        },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "Failed to save contact");
      }
    } catch (err) {
      setError("Failed to save contact");
    }
  };

  const handleNewRowChange = (e) => {
    const { name, value } = e.target;
    setNewRow((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddRow = (e) => {
    e.preventDefault();
    setFormRows((prev) => [{ ...newRow, _unsaved: true }, ...prev]);
    setNewRow(FIELDS.reduce((acc, key) => ({ ...acc, [key]: "" }), {}));
  };

  /** ─── Save ALL new rows to DB ───────────────── */
  const handleSaveRows = async () => {
    const token = localStorage.getItem("token");
    const userId = localStorage.getItem("userId");
    const newRows = formRows.filter((row) => row._unsaved);

    if (newRows.length === 0) return;

    const res = await fetch(`${import.meta.env.VITE_API_URL}/crm-add`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ userId, contacts: newRows }),
    });

    const result = await res.json();
    if (result.success) {
      setFormRows((prev) => prev.map((row) => ({ ...row, _unsaved: false })));
    }
  };

  /** ─── Delete Single Row ─────────────────────── */
  const handleRemoveRow = async (idx) => {
    const row = formRows[idx];
    const token = localStorage.getItem("token");

    if (row?._id) {
      await fetch(`${import.meta.env.VITE_API_URL}/crm/${row._id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    }

    setFormRows((prev) => prev.filter((_, i) => i !== idx));
  };

  /** ─── Delete ALL ─────────────────────────────── */
  const handleDeleteAll = async () => {
    const confirmDelete = window.confirm("Delete ALL CRM entries?");
    if (!confirmDelete) return;

    const token = localStorage.getItem("token");

    await fetch(`${import.meta.env.VITE_API_URL}/crm`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    setFormRows([]);
  };

  /** ────────────────────────────────────────────── */

  return (
    <div className="h-screen flex flex-col p-6 overflow-hidden">
      {loading && <p className="text-gray-500">Loading...</p>}
      {error && <p className="text-red-500">{error}</p>}

      <h2 className="text-2xl font-semibold mb-4">CRM Contacts</h2>

      <div  className="w-full mt-4 flex-1 flex flex-col overflow-hidden">
        {/* Scroll Container */}
        <div className="flex-1 overflow-auto border rounded-lg shadow-sm">
          <table className="min-w-max border-collapse text-sm">
            {/* TOP BUTTON ROW */}
            <thead className="sticky top-0 bg-white z-20 shadow-sm">
              <tr>
                <th
                  colSpan={FIELDS.length + 1}
                  className="p-3 border-b border-gray-300"
                >
                  <div className="flex items-center justify-start gap-3">
                    <button
                      type="button"
                      onClick={handleSaveRows}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
                    >
                      Save New Rows
                    </button>

                    <button
                      type="button"
                      onClick={handleAddRow}
                      className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition"
                    >
                      Add Row
                    </button>

                    <button
                      type="button"
                      onClick={handleDeleteAll}
                      className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
                    >
                      Delete All CRM
                    </button>
                  </div>
                </th>
              </tr>

              {/* HEADER ROW */}
              <tr className="bg-gray-50">
                {FIELDS.map((key) => (
                  <th
                    key={key}
                    className="px-3 py-2 border border-gray-300 text-left font-medium text-gray-700 whitespace-nowrap"
                  >
                    {key
                      .replace(/_/g, " ")
                      .replace(/\b\w/g, (l) => l.toUpperCase())}
                  </th>
                ))}
                <th className="px-3 py-2 border border-gray-300 text-left font-medium text-gray-700 whitespace-nowrap">
                  Actions
                </th>
              </tr>
            </thead>

            {/* NEW ROW INPUT */}
            <tbody>
              {/* <tr className="bg-green-50">
          {FIELDS.map((key) => (
            <td key={key} className="border border-gray-300 p-2">
              <input
                type="text"
                name={key}
                value={newRow[key]}
                onChange={handleNewRowChange}
                className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-blue-400 focus:outline-none text-sm"
              />
            </td>
          ))}
          <td className="border border-gray-300 p-2 text-center">—</td>
        </tr> */}

              {/* ROWS FROM DATABASE */}
              {formRows.map((row, idx) => (
                <tr key={idx} className="hover:bg-blue-500 bg-white">
                  {FIELDS.map((key) => (
                    <td
                      key={key}
                      className="border border-gray-300 p-2 text-black"
                    >
                      <input
                        type="text"
                        name={key}
                        value={row[key] ?? ""}
                        onChange={(e) => handleInputChange(e, idx)}
                        onBlur={(e) =>
                          handleSaveField(idx, e.target.name, e.target.value)
                        }
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-blue-400 focus:outline-none text-sm"
                      />
                    </td>
                  ))}

                  {/* REMOVE BUTTON */}
                  <td className="border border-gray-300 p-2 text-center">
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(idx)}
                      className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600 transition"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* FILE DROPZONE */}
        <div
          {...getRootProps()}
          className="mt-4 border-2 border-dashed border-gray-400 rounded-lg p-6 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition bg-white"
        >
          <input {...getInputProps()} />
          {isDragActive ? (
            <p className="text-blue-600 font-medium">Drop the files here...</p>
          ) : (
            <p className="text-gray-700">
              Drag & drop CSV/Excel here, or click to select
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
