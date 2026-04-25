import { useEffect, useState } from 'react'

type Message = {
  id: number
  Message: string
  Counter: number
  Priority: number
  Timestamp: string
}

type MessageWithStatus = Message & {
  status: 'Active' | 'Expired'
}

export default function DashboardMessages({ messages }: { messages: Message[] }) {
  const [displayMessages, setDisplayMessages] = useState<MessageWithStatus[]>([])

  useEffect(() => {
    const updateMessageStatus = () => {
      const currentTime = new Date().getTime(); // Current time in milliseconds
      const updatedMessages = messages.map((message) => {
        const messageTime = new Date(message.Timestamp).getTime(); // Convert message timestamp to milliseconds
        const elapsedTime = currentTime - messageTime; // Time elapsed since message was created in milliseconds

        // Calculate the remaining time in milliseconds
        const remainingTime = message.Counter * 1000 - elapsedTime;

        // Determine message status
        const status: 'Active' | 'Expired' = remainingTime > 0 ? 'Active' : 'Expired';

        console.log(`Message ID: ${message.Message}, Remaining Time: ${remainingTime}ms, Status: ${status}`); // Debugging output

        return { ...message, status };
      });

      // Filter out only active messages to display
      const activeMessages = updatedMessages.filter((msg) => msg.status === 'Active');

      // Update display messages to only show active ones
      setDisplayMessages(activeMessages);
    };

    updateMessageStatus();
    const intervalId = setInterval(updateMessageStatus, 1000);

    return () => clearInterval(intervalId);
  }, [messages]);

  return (
    <div className="w-full mx-auto p-4">
      <h6 className="text-base font-bold mb-2">Messages</h6>
      <div className="border text-sm border-gray-100 p-4 bg-white rounded-md shadow-md max-h-48 overflow-y-auto">
        {displayMessages.length === 0 ? (
          <p className="text-gray-500">No active messages</p>
        ) : (
          <ul className="space-y-2">
            {displayMessages.map((msg) => (
              <li
                key={msg.id}
                className={`p-2 rounded border font-bold ${getColorClass(msg.Priority)}`}
              >
                {msg.Message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// Helper function to determine the Tailwind color class based on priority
function getColorClass(priority: number) {
  switch (priority) {
    case 4:
      return 'text-red-500 border-red-500';
    case 3:
      return 'text-orange-400  border-orange-300';
    case 2:
      return 'text-yellow-500  border-yellow-500';
    case 1:
      return 'text-black  border-black';
    default:
      return 'text-gray-500  border-gray-500';
  }
}
