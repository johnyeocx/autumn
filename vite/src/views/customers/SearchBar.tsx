import SmallSpinner from "@/components/general/SmallSpinner";
import { debounce } from "lodash";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router";

export function SearchBar({
  query,
  setQuery,
  setCurrentPage,
  mutate,
  setSearching,
}: {
  query: string;
  setQuery: (query: string) => void;
  setCurrentPage: (page: number) => void;
  setSearching: (searching: boolean) => void;
  mutate: () => Promise<void>;
}) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const prevQueryRef = useRef<string>(query);

  const debouncedSearch = useMemo(
    () =>
      debounce(async (query: string) => {
        setSearching(true);
        let params = new URLSearchParams(location.search);
        params.set("q", query);
        navigate(`${location.pathname}?${params.toString()}`);
      }, 350),
    [location.search, location.pathname, navigate, setSearching]
  );

  const handleQueryChange = async () => {
    setLoading(true);
    setCurrentPage(1);
    setSearching(true);
    await mutate();
    setLoading(false);
    setSearching(false);
  };

  useEffect(() => {
    const searchParamQuery = searchParams.get("q") || "";
    if (searchParamQuery !== prevQueryRef.current) {
      prevQueryRef.current = searchParamQuery;
      handleQueryChange();
    }
  }, [searchParams]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    debouncedSearch(q);
  };

  return (
    <div
      className="rounded-sm py-1 h-10 px-2 text-sm pl-4
    flex items-center w-full max-w-lg min-w-xs text-t2 border-x"
    >
      <Search size={13} className="text-t3 mr-2" />
      <input
        onChange={handleChange}
        className="outline-none w-full bg-transparent"
        placeholder="Search..."
        defaultValue={query}
      ></input>
      <div className="w-5 h-5 ml-1">{loading && <SmallSpinner />}</div>
    </div>
  );
}
