"use client";

import React, { useEffect, useRef } from "react";
import { AppEnv } from "@autumn/shared";
import { useAxiosPostSWR, useAxiosSWR } from "@/services/useAxiosSwr";
import { CustomersContext } from "./CustomersContext";
import { CustomersTable } from "./CustomersTable";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import CreateCustomer from "./CreateCustomer";
import { SearchBar } from "./SearchBar";
import LoadingScreen from "../general/LoadingScreen";
import FilterButton from "./FilterButton";
import SmallSpinner from "@/components/general/SmallSpinner";
import { useSearchParams } from "react-router";
import { useSetSearchParams } from "@/utils/setSearchParams";

function CustomersView({ env }: { env: AppEnv }) {
  const pageSize = 50;
  const [searchParams] = useSearchParams();

  const [searchQuery, setSearchQuery] = React.useState(
    searchParams.get("q") || "",
  );

  const [filters, setFilters] = React.useState<any>({
    status: searchParams.get("status"),
    product_id: searchParams.get("product_id"),
  });

  const [pagination, setPagination] = React.useState<{
    page: number;
    lastItemStack: any;
  }>({
    page: 1,
    lastItemStack: [],
  });

  const [searching, setSearching] = React.useState(false);
  const [paginationLoading, setPaginationLoading] = React.useState(false);

  const { data: productsData, isLoading: productsLoading } = useAxiosSWR({
    url: `/products/data`,
    env,
  });

  const { data, isLoading, error, mutate } = useAxiosPostSWR({
    url: `/v1/customers/all/search`,
    env,
    data: {
      search: searchParams.get("q") || "",
      filters: {
        status: searchParams.get("status"),
        product_id: searchParams.get("product_id"),
      },

      page: pagination.page,
      page_size: pageSize,
      last_item: pagination.lastItemStack[pagination.lastItemStack.length - 1],
      last_id:
        pagination.lastItemStack[pagination.lastItemStack.length - 1]
          ?.internal_id,
    },
  });

  const isFirstRender = useRef(true);
  const paginationFirstRender = useRef(true);
  const searchParamsChanged = useRef(false);

  const resetPagination = () => {
    setPagination({
      page: 1,
      lastItemStack: [],
    });
  };

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    searchParamsChanged.current = true;
    resetPagination();

    setPaginationLoading(true);
    mutate().finally(() => {
      setPaginationLoading(false);
    });
  }, [searchParams]);

  useEffect(() => {
    if (paginationFirstRender.current) {
      paginationFirstRender.current = false;
      return;
    }

    if (searchParamsChanged.current) {
      searchParamsChanged.current = false;
      return;
    }

    setPaginationLoading(true);
    mutate().finally(() => {
      setPaginationLoading(false);
    });
  }, [pagination]);

  const totalPages = Math.ceil((data?.totalCount || 0) / pageSize);

  if (isLoading || productsLoading) {
    return <LoadingScreen />;
  }

  const handleNextPage = async () => {
    if (totalPages == 0 || pagination.page === totalPages) return;
    setPagination((prev) => {
      const lastItem = data?.customers[data?.customers.length - 1];
      const newItem = {
        created_at: lastItem.created_at,
        name: lastItem.name,
        internal_id: lastItem.internal_id,
      };

      const newLastItemStack = [...prev.lastItemStack, newItem];

      return {
        page: prev.page + 1,
        lastItemStack: newLastItemStack,
      };
    });
  };

  const handlePreviousPage = async () => {
    if (pagination.page === 1) return;
    const newLastItemStack = pagination.lastItemStack.slice(0, -1);
    setPagination({
      page: pagination.page - 1,
      lastItemStack: newLastItemStack,
    });
  };

  const handleFilterChange = (newFilters: any) => {
    setPagination({
      page: 1,
      lastItemStack: [],
    });
    setFilters(newFilters);
  };

  return (
    <CustomersContext.Provider
      value={{
        customers: data?.customers,
        env,
        mutate,
        filters,
        setFilters: handleFilterChange, // Use the new handler
        products: productsData?.products,
        versionCounts: productsData?.versionCounts,
      }}
    >
      <div className="flex flex-col gap-4 h-fit relative w-full">
        <h1 className="text-xl font-medium shrink-0 pt-6 pl-10">Customers</h1>
        <div>
          <div className="flex w-full justify-between sticky top-0 z-10 border-y h-10 bg-stone-100 pl-10 pr-7 items-center">
            <div className="flex gap-4 items-center">
              <div className="flex justify-center items-center gap-8 text-xs text-t3 pr-1 rounded-sm shrink-0 w-[100px]">
                {paginationLoading && !searching ? (
                  <div className="h-8 flex items-center justify-center">
                    <SmallSpinner />
                  </div>
                ) : (
                  <Pagination className="w-fit h-8 text-xs ">
                    <PaginationContent className="w-full flex justify-between ">
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={handlePreviousPage}
                          isActive={pagination.page !== 1}
                          className="text-xs cursor-pointer p-1 h-6"
                        />
                      </PaginationItem>
                      <PaginationItem className="">
                        {pagination.page} / {Math.max(totalPages, 1)}
                      </PaginationItem>
                      <PaginationItem>
                        <PaginationNext
                          onClick={handleNextPage}
                          isActive={pagination.page !== totalPages}
                          className="text-xs cursor-pointer p-1 h-6"
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                )}
              </div>
              <SearchBar
                query={searchQuery}
                setQuery={setSearchQuery}
                setCurrentPage={(page: number) => {
                  setPagination({
                    page: page,
                    lastItemStack: [],
                  });
                }}
                mutate={mutate}
                setSearching={setSearching}
              />
              <div className="h-10 flex items-center border-r pr-4 gap-2">
                <FilterButton />
                <p className="text-t2 px-1 rounded-md bg-stone-200 text-sm h-fit">
                  {data?.totalCount}
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <CreateCustomer />
            </div>
          </div>
          {data?.customers?.length > 0 ? (
            <div className="h-fit max-h-full">
              <CustomersTable customers={data.customers} />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-t3 text-sm w-full min-h-[60vh] gap-4">
  <img
    src="./customer.png"
    alt="No customers"
    className="w-48 h-48 opacity-60 filter grayscale"
    // className="w-48 h-48 opacity-80 filter brightness-0 invert" // this is for dark mode
  />
  <span>
    {
      // Show loading state during search transitions to prevent flash of incorrect message
      (paginationLoading || searching) 
        ? "Loading..." 
        : searchParams.get("q")?.trim()
        ? "No matching results found. Try a different search."
        : "No customers found... yet 😉"
    }
  </span>
</div>
          )}
        </div>
        {/* <div className="shrink-0 sticky bottom-0">
          <CreateCustomer />
        </div> */}
      </div>
    </CustomersContext.Provider>
  );
}

export default CustomersView;

{
  /* <p className="text-t3 text-sm whitespace-nowrap items-center flex gap-1">
              <span className="font-semibold">{data?.totalCount} </span>
              {data?.totalCount === 1 ? "Customer" : "Customers"}
            </p> */
}
