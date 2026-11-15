import pytest
from django.core.exceptions import ValidationError

from customers.models import Customer
from orders.models import CustomDesignPlacement, Order, OrderItem, OrderStatus
from orders.services import build_order_item

pytestmark = pytest.mark.django_db


def _order():
    customer = Customer.objects.create(email='jana@example.cz', first_name='Jana', last_name='Nováková')
    return Order.objects.create(
        order_number='TRK-2026-6001', customer=customer, status=OrderStatus.NEW,
        billing_full_name='Jana', billing_street='Horní 12', billing_city='Vrchlabí', billing_zip='54301',
        shipping_full_name='Jana', shipping_street='Horní 12', shipping_city='Vrchlabí', shipping_zip='54301',
    )


def _real_item(order, *, product_type, cut, color, motif=None, is_custom=False, placements=None):
    build_order_item(order, {
        'is_custom': is_custom, 'motif': motif, 'custom_text': '', 'product_type': product_type,
        'cut': cut, 'color': color, 'size': 'M', 'quantity': 1, 'placements': placements or [],
    })
    return order.items.get()


def test_order_str_is_order_number():
    order = _order()
    assert str(order) == order.order_number


def test_order_item_str_is_item_label(motif, product_type, cut, color):
    order = _order()
    item = _real_item(order, product_type=product_type, cut=cut, color=color, motif=motif)
    assert str(item) == item.item_label


def test_order_item_clean_rejects_custom_item_with_motif(motif):
    order = _order()
    item = OrderItem(order=order, is_custom=True, motif=motif)

    with pytest.raises(ValidationError):
        item.clean()


def test_order_item_clean_rejects_catalog_item_without_motif():
    order = _order()
    item = OrderItem(order=order, is_custom=False, motif=None)

    with pytest.raises(ValidationError):
        item.clean()


def test_custom_design_placement_clean_rejects_mismatched_product_type(product_type, cut, color, print_area):
    from catalog.models import PrintArea, ProductType

    order = _order()
    item = _real_item(order, product_type=product_type, cut=cut, color=color, is_custom=True, placements=[{
        'print_area': print_area, 'url': 'x', 'x': 0, 'y': 0, 'width': 10, 'height': 10, 'rotation_deg': 0,
    }])
    other_type = ProductType.objects.create(name='Mikina model test')
    mismatched_area = PrintArea.objects.create(product_type=other_type, name='Kapuce model test', width_mm=50, height_mm=50)
    placement = CustomDesignPlacement(order_item=item, print_area=mismatched_area, url='https://files.example/x.png', width=10, height=10)

    with pytest.raises(ValidationError):
        placement.clean()


def test_custom_design_placement_clean_accepts_matching_product_type(product_type, cut, color, print_area):
    order = _order()
    item = _real_item(order, product_type=product_type, cut=cut, color=color, is_custom=True, placements=[{
        'print_area': print_area, 'url': 'https://files.example/x.png', 'x': 0, 'y': 0, 'width': 10, 'height': 10, 'rotation_deg': 0,
    }])
    placement = item.design_placements.get()

    placement.clean()  # must not raise
