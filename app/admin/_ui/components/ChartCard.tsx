"use client";

import type { ReactNode } from "react";
import { Card, CardHeader, CardBody } from "./Card";
import { cn } from "@/lib/utils";

interface ChartCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function ChartCard({ title, description, children, className }: ChartCardProps) {
  return (
    <Card className={cn("rounded-lg border-[#DADCE0]", className)}>
      <CardHeader title={title} description={description} />
      <CardBody className="pt-0">
        <div className="h-[240px] w-full">{children}</div>
      </CardBody>
    </Card>
  );
}
