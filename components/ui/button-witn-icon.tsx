import { ArrowUpRight } from "lucide-react";

import { ButtonWithIcon } from "@/components/ui/button-with-icon";

const ButtonWithIconDemo = () => {
  return <ButtonWithIcon label="Let's Collaborate" icon={<ArrowUpRight size={16} aria-hidden />} />;
};

export default ButtonWithIconDemo;
