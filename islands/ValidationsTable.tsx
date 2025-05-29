import { useState, useEffect } from "preact/hooks";
import type { ValidationRecord } from "../types.ts";

interface Props {
  initialValidations: ValidationRecord[];
}

function formatTimeAgo(timestamp: string): string {
  const now = new Date();
  const time = new Date(timestamp);
  const diffMs = now.getTime() - time.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function getQualityEmoji(quality: string): string {
  switch (quality) {
    case "high": return "🟢";
    case "medium": return "🟡";
    case "low": return "🔴";
    default: return "⚪";
  }
}

function formatEngagementCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return count.toString();
}

export default function ValidationsTable({ initialValidations }: Props) {
  const [validations, setValidations] = useState<ValidationRecord[]>(initialValidations);
  const [sortField, setSortField] = useState<"timestamp" | "quality" | "engagement">("timestamp");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Real-time updates (we'll implement SSE later)
  useEffect(() => {
    // TODO: Implement SSE for real-time updates
    // const eventSource = new EventSource('/api/validations/stream');
    // eventSource.onmessage = (event) => {
    //   const newValidation = JSON.parse(event.data);
    //   setValidations(prev => [newValidation, ...prev.slice(0, 49)]);
    // };
    // return () => eventSource.close();
  }, []);

  const sortedValidations = [...validations].sort((a, b) => {
    let comparison = 0;
    
    switch (sortField) {
      case "timestamp":
        comparison = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        break;
      case "quality":
        const qualityOrder = { high: 3, medium: 2, low: 1 };
        comparison = qualityOrder[a.overallQuality] - qualityOrder[b.overallQuality];
        break;
      case "engagement":
        comparison = a.engagementStats.total_unique_users - b.engagementStats.total_unique_users;
        break;
    }
    
    return sortDirection === "desc" ? -comparison : comparison;
  });

  const handleSort = (field: typeof sortField) => {
    if (field === sortField) {
      setSortDirection(sortDirection === "desc" ? "asc" : "desc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  if (validations.length === 0) {
    return (
      <div class="p-8 text-center text-gray-500">
        <div class="text-xl mb-2">🔍</div>
        <div>No validations yet. Waiting for the first validation...</div>
      </div>
    );
  }

  return (
    <div class="overflow-hidden">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th 
                class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort("timestamp")}
              >
                Time {sortField === "timestamp" && (sortDirection === "desc" ? "↓" : "↑")}
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tweet Author
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Validated By
              </th>
              <th 
                class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort("quality")}
              >
                Quality {sortField === "quality" && (sortDirection === "desc" ? "↓" : "↑")}
              </th>
              <th 
                class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort("engagement")}
              >
                Engagers {sortField === "engagement" && (sortDirection === "desc" ? "↓" : "↑")}
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Link
              </th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            {sortedValidations.map((validation) => (
              <tr key={validation.id} class="hover:bg-gray-50">
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {formatTimeAgo(validation.timestamp)}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="text-sm font-medium text-gray-900">
                    {validation.tweetAuthor}
                  </div>
                  <div class="text-sm text-gray-500">
                    @{validation.tweetAuthorHandle}
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  @{validation.requestedByHandle}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="flex items-center">
                    <span class="mr-2">{getQualityEmoji(validation.overallQuality)}</span>
                    <span class="text-sm font-medium">
                      {validation.engagementStats.reputable_percentage}%
                    </span>
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  <div>
                    {formatEngagementCount(validation.engagementStats.total_unique_users)} total
                  </div>
                  <div class="text-xs text-gray-500">
                    {validation.engagementStats.retweeters_rate_limited || 
                     validation.engagementStats.repliers_rate_limited || 
                     validation.engagementStats.quote_tweeters_rate_limited ? "(RL)" : ""}
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <a 
                    href={validation.tweetUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    class="text-blue-600 hover:text-blue-900"
                  >
                    🔗
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
} 