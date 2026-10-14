"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Fuse from "fuse.js";
import { Unsubscribe } from "firebase/firestore";
import { subscribeToBookings } from "@/hooks/use-bookings-store";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandList,
} from "@/components/ui/command";
import SearchResultItem from "./SearchResultItem";
import { SearchResult, RecentSearch, SearchCategory } from "@/types/search";
import { searchCategories } from "@/lib/search/searchConfig";
import {
  X,
  Clock,
  ArrowUp,
  ArrowDown,
  CornerDownLeft,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface GlobalSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const RECENT_SEARCHES_KEY = "recent-searches";
const MAX_RECENT_SEARCHES = 8;

export default function GlobalSearchDialog({
  open,
  onOpenChange,
}: GlobalSearchDialogProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [categoryData, setCategoryData] = useState<Record<string, any[]>>({});
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);

  // Load recent searches from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setRecentSearches(parsed);
      } catch (error) {
        console.error("Failed to parse recent searches:", error);
      }
    }
  }, []);

  // Save recent search
  const saveRecentSearch = useCallback(
    (query: string, category?: SearchCategory) => {
      if (!query.trim()) return;

      const newSearch: RecentSearch = {
        query: query.trim(),
        timestamp: Date.now(),
        category,
      };

      const updated = [
        newSearch,
        ...recentSearches.filter((s) => s.query !== query.trim()),
      ].slice(0, MAX_RECENT_SEARCHES);

      setRecentSearches(updated);
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    },
    [recentSearches]
  );

  // Delete recent search
  const deleteRecentSearch = useCallback(
    (query: string) => {
      const updated = recentSearches.filter((s) => s.query !== query);
      setRecentSearches(updated);
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    },
    [recentSearches]
  );

  // Clear all recent searches
  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  }, []);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch data when dialog opens
  useEffect(() => {
    if (!open) {
      return;
    }

    setIsLoading(true);
    const unsubscribes: Unsubscribe[] = [];

    // Fetch all category data (in parallel)
    const fetchAllData = async () => {
      const data: Record<string, any[]> = {};

      await Promise.all(
        searchCategories.map(async (category) => {
          try {
            // Bookings come from the shared realtime store
            if (category.useRealtimeListener && category.key === "bookings") {
              const unsubscribe = subscribeToBookings(({ bookings }) => {
                setCategoryData((prev) => ({
                  ...prev,
                  [category.key]: bookings,
                }));
              });
              unsubscribes.push(unsubscribe);
            } else {
              // Static fetch for other categories
              data[category.key] = await category.fetchData();
            }
          } catch (error) {
            console.error(`Error fetching ${category.key}:`, error);
            data[category.key] = [];
          }
        })
      );

      setCategoryData((prev) => ({ ...prev, ...data }));
      setIsLoading(false);
    };

    fetchAllData();

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [open]);

  // Create Fuse instances per category
  const fuseInstances = useMemo(() => {
    const instances: Record<string, Fuse<any>> = {};

    for (const category of searchCategories) {
      const data = categoryData[category.key] || [];
      if (data.length > 0) {
        instances[category.key] = new Fuse(data, {
          keys: category.searchKeys,
          threshold: category.threshold,
          includeScore: true,
          minMatchCharLength: 2,
        });
      }
    }

    return instances;
  }, [categoryData]);

  // Search across all categories
  const searchResults = useMemo(() => {
    if (!debouncedQuery.trim()) {
      return {};
    }

    const results: Record<string, SearchResult[]> = {};

    for (const category of searchCategories) {
      const fuse = fuseInstances[category.key];
      if (fuse) {
        const fuseResults = fuse.search(debouncedQuery);
        results[category.key] = fuseResults.map((result) =>
          category.formatResult(result.item)
        );
      }
    }

    return results;
  }, [debouncedQuery, fuseInstances]);

  // Handle result selection
  const handleSelect = useCallback(
    (result: SearchResult) => {
      // Show navigating state
      setIsNavigating(true);

      // Save to recent searches
      saveRecentSearch(searchQuery, result.category);

      // Navigate to the result
      router.push(result.url, { scroll: false });

      // Close dialog after a short delay to allow navigation to start
      setTimeout(() => {
        onOpenChange(false);
        setIsNavigating(false);
        setSearchQuery("");
      }, 100);
    },
    [router, onOpenChange, searchQuery, saveRecentSearch]
  );

  // Handle recent search click
  const handleRecentSearchClick = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setDebouncedQuery("");
    }
  }, [open]);

  const hasResults = Object.values(searchResults).some(
    (results) => results.length > 0
  );
  const showRecentSearches = !searchQuery.trim() && recentSearches.length > 0;
  const showEmptyState = !searchQuery.trim() && recentSearches.length === 0;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search bookings, tours, payment terms..."
        value={searchQuery}
        onValueChange={setSearchQuery}
      />
      <CommandList className="min-h-[250px] sm:min-h-[300px] max-h-[50vh] sm:max-h-[400px]">
        {/* Empty State - No search query and no history */}
        {showEmptyState && (
          <div className="py-8 sm:py-12 text-center px-4">
            <div className="mx-auto w-12 h-12 sm:w-16 sm:h-16 bg-muted/50 rounded-full flex items-center justify-center mb-3 sm:mb-4">
              <ArrowUp className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground rotate-45" />
            </div>
            <h3 className="text-sm font-semibold text-foreground mb-2">
              Start searching
            </h3>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Search across bookings, tours, payment terms, email templates, and
              more
            </p>
            <div className="mt-3 sm:mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <kbd className="px-2 py-1 bg-muted border border-border rounded">
                ⌘K
              </kbd>
              <span>to open</span>
            </div>
          </div>
        )}

        {/* Recent Searches */}
        {showRecentSearches && (
          <CommandGroup
            heading={
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Recent Searches
                </span>
                <button
                  onClick={clearRecentSearches}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear all
                </button>
              </div>
            }
          >
            {recentSearches.map((search, index) => (
              <div
                key={`${search.query}-${index}`}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 hover:bg-muted/50 cursor-pointer group"
                onClick={() => handleRecentSearchClick(search.query)}
              >
                <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="flex-1 text-sm text-foreground truncate">
                  {search.query}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteRecentSearch(search.query);
                  }}
                  className="opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-muted rounded"
                  aria-label="Delete"
                >
                  <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                </button>
              </div>
            ))}
          </CommandGroup>
        )}

        {/* Search Results - No Results Found */}
        {debouncedQuery.trim() && !hasResults && !isLoading && (
          <div className="py-8 sm:py-12 text-center px-4">
            <div className="mx-auto w-12 h-12 sm:w-16 sm:h-16 bg-muted/50 rounded-full flex items-center justify-center mb-3 sm:mb-4">
              <X className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-semibold text-foreground mb-2">
              No results found
            </h3>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              No matches found for "
              <span className="font-medium">{debouncedQuery}</span>". Try
              searching with different keywords.
            </p>
          </div>
        )}

        {/* Loading State */}
        {isLoading && debouncedQuery.trim() && (
          <div className="py-8 sm:py-12 text-center px-4">
            <div className="mx-auto w-12 h-12 sm:w-16 sm:h-16 bg-muted/50 rounded-full flex items-center justify-center mb-3 sm:mb-4">
              <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 text-primary animate-spin" />
            </div>
            <h3 className="text-sm font-semibold text-foreground mb-2">
              Searching...
            </h3>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Finding results for "
              <span className="font-medium">{debouncedQuery}</span>"
            </p>
          </div>
        )}

        {/* Results by Category */}
        {!isLoading &&
          searchCategories.map((category) => {
            const results = searchResults[category.key] || [];
            if (results.length === 0) return null;

            const CategoryIcon = category.icon;

            return (
              <CommandGroup
                key={category.key}
                heading={
                  <div className="flex items-center gap-2">
                    <CategoryIcon className="h-4 w-4" />
                    <span>{category.label}</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {results.length}
                    </span>
                  </div>
                }
              >
                {results.map((result) => (
                  <SearchResultItem
                    key={`${result.category}-${result.id}`}
                    result={result}
                    onSelect={() => handleSelect(result)}
                  />
                ))}
              </CommandGroup>
            );
          })}
      </CommandList>

      {/* Footer with keyboard hints */}
      <div className="border-t border-border px-3 sm:px-4 py-2 sm:py-3 bg-muted/30">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="hidden sm:flex items-center gap-4">
            <div className="flex items-center gap-1">
              <kbd className="px-2 py-1 bg-background border border-border rounded text-xs">
                <ArrowUp className="h-3 w-3 inline" />
              </kbd>
              <kbd className="px-2 py-1 bg-background border border-border rounded text-xs">
                <ArrowDown className="h-3 w-3 inline" />
              </kbd>
              <span className="ml-1">to navigate</span>
            </div>
            <div className="flex items-center gap-1">
              <kbd className="px-2 py-1 bg-background border border-border rounded text-xs flex items-center gap-1">
                <CornerDownLeft className="h-3 w-3" />
              </kbd>
              <span className="ml-1">to select</span>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:ml-auto">
            <kbd className="px-2 py-1 bg-background border border-border rounded text-xs">
              Esc
            </kbd>
            <span className="ml-1">to close</span>
          </div>
        </div>
      </div>

      {/* Loading Modal Overlay */}
      {isNavigating && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-background rounded-2xl p-8 shadow-2xl border border-border flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium text-foreground">Loading...</p>
          </div>
        </div>
      )}
    </CommandDialog>
  );
}
