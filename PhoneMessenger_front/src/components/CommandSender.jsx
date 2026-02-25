import React, { useState, useEffect } from "react";
import axios from "axios";

function CommandSender() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState("");
  const [contacts, setContacts] = useState([]);
  const [sending, setSending] = useState(false);

  // Fetch contacts on mount
  useEffect(() => {
    const fetchContacts = async () => {
      try {
        const token = localStorage.getItem("token");
        const userId = localStorage.getItem("userId");
        if (!userId) return;

        const res = await axios.get(
          `${import.meta.env.VITE_API_URL}/crm/${userId}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        setContacts(res.data || []);
      } catch (err) {
        console.error("Failed to fetch contacts:", err);
      }
    };

    fetchContacts();
  }, []);

  const handleSend = async () => {
    if (!message.trim()) {
      alert("Please enter a message");
      return;
    }

    setSending(true);
    setOutput("");

    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(
        `${import.meta.env.VITE_API_URL}/send-batch-sms`,
        { message },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      let resultText = `✅ ${res.data.message}\n\n`;
      resultText += `Status: Messages are being sent in the background.\n`;
      resultText += `You can safely close this page and check back later.\n\n`;
      resultText += `Total contacts: ${contacts.filter(c => c.PhoneNumber).length}`;

      setOutput(resultText);
      setMessage("");
    } catch (err) {
      console.error(err);
      setOutput("❌ Failed to queue SMS: " + (err.response?.data?.error || err.message));
    }

    setSending(false);
  };

  return (
    <div style={{ maxWidth: 700, margin: "2rem auto" }} className="p-4 border rounded bg-white">
      <h2 className="text-black">📱 Send SMS to All Contacts</h2>
      
      <div className="mt-4 p-3 bg-blue-50 rounded border border-blue-200">
        <p className="text-black text-sm">
          <strong>Total Contacts:</strong> {contacts.filter(c => c.phone).length}
        </p>
        <p className="text-gray-600 text-xs mt-1">
          ⚙️ Background Processing: Messages will be sent automatically even if you close the page.
        </p>
        <p className="text-gray-600 text-xs mt-1">
          🚫 Rate Limit: Each contact can only receive one message per week
        </p>
      </div>

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Enter your message here..."
        rows={6}
        style={{ width: "100%", padding: "10px", fontSize: "16px", marginTop: "1rem" }}
        disabled={sending}
        className="border rounded px-3 py-2 text-black"
      />

      <div className="flex items-center gap-2 mt-4">
        <button
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition"
          onClick={handleSend}
          disabled={sending || !message.trim()}
          style={{ padding: "10px 20px", fontSize: "16px" }}
        >
          {sending ? "Queuing..." : "Queue Messages"}
        </button>
      </div>

      {output && (
        <div style={{ marginTop: "20px", whiteSpace: "pre-wrap" }} className="mt-4 p-3 border rounded bg-gray-50 text-black">
          <strong>Result:</strong>
          <p>{output}</p>
        </div>
      )}
    </div>
  );
}

export default CommandSender;